import { execa } from "execa";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Plan as PlanSchema, type Plan } from "@blacksmith/shared";
import { AppError } from "../../utils/errors.js";
import { PLANNER_JSON_CONTRACT, PLANNER_SYSTEM_PROMPT } from "../prompts/plannerPrompt.js";
import type { AiProvider, PlanInput } from "./types.js";

const CODEX_TIMEOUT_MS = 120_000;
const AVAILABILITY_TTL_MS = 30_000;
let availableCache: { value: boolean; checkedAt: number } | null = null;

/**
 * Whether the Codex CLI is installed. Cached with a short TTL so installing
 * Codex after the server starts is picked up without a restart. This only tells
 * us the binary exists, not that the user is logged in (a login/runtime failure
 * surfaces when we actually invoke it, and the planner falls back).
 */
export async function isCodexAvailable(): Promise<boolean> {
  if (availableCache && Date.now() - availableCache.checkedAt < AVAILABILITY_TTL_MS) {
    return availableCache.value;
  }
  let value = false;
  try {
    await execa("codex", ["--version"], { timeout: 5000 });
    value = true;
  } catch {
    value = false;
  }
  availableCache = { value, checkedAt: Date.now() };
  return value;
}

function buildPrompt(input: PlanInput): string {
  const parts = [
    PLANNER_SYSTEM_PROMPT,
    PLANNER_JSON_CONTRACT,
    `User request: ${input.prompt}`,
    `Localnet running: ${input.running}`,
  ];
  if (input.previousManifest) {
    parts.push(`Previous manifest:\n${JSON.stringify(input.previousManifest)}`);
  }
  parts.push("Output ONLY the JSON object — no prose, no code fences, no tool calls.");
  return parts.join("\n\n");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Be lenient: grab the outermost JSON object if the model added stray text.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(slice);
}

/**
 * Plan via the locally installed Codex CLI (non-interactive). Reuses the user's
 * existing Codex/ChatGPT auth — no API key needed. Runs read-only, ephemeral,
 * in a throwaway working dir so Codex behaves as a pure text generator.
 */
export const codexProvider: AiProvider = {
  name: "codex",
  async generate(input: PlanInput): Promise<Plan> {
    if (!(await isCodexAvailable())) {
      throw new AppError("Codex CLI not found on PATH", 400);
    }

    const work = mkdtempSync(join(tmpdir(), "blacksmith-codex-"));
    const outFile = join(work, "plan.json");
    try {
      await execa(
        "codex",
        [
          "exec",
          "--skip-git-repo-check",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--color",
          "never",
          "-C",
          work,
          "-o",
          outFile,
          "-",
        ],
        { input: buildPrompt(input), timeout: CODEX_TIMEOUT_MS },
      );
      const raw = readFileSync(outFile, "utf8");
      return PlanSchema.parse(extractJson(raw));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
};
