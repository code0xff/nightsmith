import type { FastifyInstance } from "fastify";
import { AiConnectRequest, type AiStatus } from "@blacksmith/shared";
import {
  isOpenAiConnected,
  isProviderEnvManaged,
  resolveProvider,
  setAiConfig,
} from "../ai/credentials.js";
import { isCodexAvailable } from "../ai/providers/codex.js";
import { PROVIDER_NAMES } from "../ai/planner.js";

const MODEL = process.env.BLACKSMITH_OPENAI_MODEL ?? "gpt-5.5";

async function status(): Promise<AiStatus> {
  return {
    provider: resolveProvider(),
    openaiConnected: isOpenAiConnected(),
    codexAvailable: await isCodexAvailable(),
    envManaged: isProviderEnvManaged(),
    model: MODEL,
    providers: PROVIDER_NAMES as AiStatus["providers"],
  };
}

export function registerAiRoutes(app: FastifyInstance): void {
  // Status never includes the key — only whether one is present.
  app.get("/api/ai", async (): Promise<AiStatus> => status());

  app.post("/api/ai/connect", async (req): Promise<AiStatus> => {
    const body = AiConnectRequest.parse(req.body);
    setAiConfig({
      ...(body.provider ? { provider: body.provider } : {}),
      ...(body.openaiApiKey !== undefined ? { openaiApiKey: body.openaiApiKey } : {}),
    });
    return status();
  });

  app.post("/api/ai/disconnect", async (): Promise<AiStatus> => {
    setAiConfig({ provider: "mock", openaiApiKey: "" });
    return status();
  });
}
