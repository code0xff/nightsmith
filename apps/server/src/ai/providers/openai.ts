import { Plan as PlanSchema, type Plan } from "@blacksmith/shared";
import { AppError, errorMessage } from "../../utils/errors.js";
import { resolveOpenAiKey } from "../credentials.js";
import { PLANNER_JSON_CONTRACT, PLANNER_SYSTEM_PROMPT } from "../prompts/plannerPrompt.js";
import type { AiProvider, PlanInput } from "./types.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.BLACKSMITH_OPENAI_MODEL ?? "gpt-5.5";
const REQUEST_TIMEOUT_MS = 60_000;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildUserContent(input: PlanInput): string {
  const parts = [`User request: ${input.prompt}`, `Localnet running: ${input.running}`];
  if (input.previousManifest) {
    parts.push(
      `Previous manifest (for modify/replay context):\n${JSON.stringify(input.previousManifest)}`,
    );
  }
  parts.push(PLANNER_JSON_CONTRACT);
  return parts.join("\n\n");
}

async function callOpenAI(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Abort or network error — typed so the planner can fall back.
    throw new AppError(
      controller.signal.aborted
        ? `OpenAI request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `OpenAI request failed: ${errorMessage(err)}`,
      504,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Never echo the request (which carries the key); surface only status/body.
    throw new AppError(`OpenAI request failed (${res.status})`, 502, detail ? [detail.slice(0, 500)] : undefined);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AppError("OpenAI returned an empty response", 502);
  return content;
}

/** Strip accidental ``` fences and parse to a validated Plan. */
function parsePlan(raw: string): Plan {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return PlanSchema.parse(JSON.parse(cleaned));
}

/**
 * OpenAI (ChatGPT) planner. Sends the system prompt + JSON contract and the
 * user's request (never any secret), then validates the model's JSON against
 * the Plan schema. Retries once with the validation error as feedback.
 */
export const openaiProvider: AiProvider = {
  name: "openai",
  async generate(input: PlanInput): Promise<Plan> {
    const apiKey = resolveOpenAiKey();
    if (!apiKey) {
      throw new AppError(
        "OpenAI is not connected. Add an API key in the cockpit (Connect) or set OPENAI_API_KEY.",
        400,
      );
    }

    const messages: ChatMessage[] = [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: buildUserContent(input) },
    ];

    const first = await callOpenAI(apiKey, messages);
    try {
      return parsePlan(first);
    } catch (err) {
      // One corrective retry: feed the model its own output and the error.
      messages.push({ role: "assistant", content: first });
      messages.push({
        role: "user",
        content: `That did not match the required schema (${errorMessage(err)}). Reply again with ONLY a corrected JSON object that matches the contract exactly.`,
      });
      const second = await callOpenAI(apiKey, messages);
      return parsePlan(second);
    }
  },
};
