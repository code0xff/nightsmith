import type { FastifyInstance } from "fastify";
import { AiConnectRequest, type AiStatus } from "@nightsmith/shared";
import {
  clearOpenAiKey,
  isOpenAiConnected,
  setOpenAiKey,
} from "../ai/credentials.js";
import { isCodexAvailable } from "../ai/providers/codex.js";
import { activeProvider, PROVIDER_NAMES } from "../ai/planner.js";

const MODEL = process.env.NIGHTSMITH_OPENAI_MODEL ?? "gpt-5.5";

async function status(): Promise<AiStatus> {
  return {
    provider: await activeProvider(),
    openaiConnected: isOpenAiConnected(),
    codexAvailable: await isCodexAvailable(),
    model: MODEL,
    providers: PROVIDER_NAMES,
  };
}

export function registerAiRoutes(app: FastifyInstance): void {
  // Status never includes the key — only whether one is present.
  app.get("/api/ai", async (): Promise<AiStatus> => status());

  // The only thing the user can set is the OpenAI key; provider is automatic.
  app.post("/api/ai/connect", async (req): Promise<AiStatus> => {
    const body = AiConnectRequest.parse(req.body);
    if (body.openaiApiKey !== undefined) setOpenAiKey(body.openaiApiKey);
    return status();
  });

  app.post("/api/ai/disconnect", async (): Promise<AiStatus> => {
    clearOpenAiKey();
    return status();
  });
}
