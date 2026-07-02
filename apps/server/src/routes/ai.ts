import type { FastifyInstance } from "fastify";
import type { AiStatus } from "@nightsmith/shared";
import { isOpenAiConnected } from "../ai/credentials.js";
import { isClaudeAvailable } from "../ai/providers/claude.js";
import { isCodexAvailable } from "../ai/providers/codex.js";
import { activeProvider, PROVIDER_NAMES } from "../ai/planner.js";

const MODEL = process.env.NIGHTSMITH_OPENAI_MODEL ?? "gpt-5.5";

async function status(): Promise<AiStatus> {
  return {
    provider: await activeProvider(),
    openaiConnected: isOpenAiConnected(),
    codexAvailable: await isCodexAvailable(),
    claudeAvailable: await isClaudeAvailable(),
    model: MODEL,
    providers: PROVIDER_NAMES,
  };
}

export function registerAiRoutes(app: FastifyInstance): void {
  // Read-only: the active provider is auto-resolved. The OpenAI key comes from
  // the OPENAI_API_KEY environment variable only — never set/stored via the API.
  app.get("/api/ai", async (): Promise<AiStatus> => status());
}
