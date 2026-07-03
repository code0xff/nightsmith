import type { FastifyInstance } from "fastify";
import { ExecuteRequest, type ExecuteResponse } from "@nightsmith/shared";
import { runPlan } from "../executor/runPlan.js";
import { assertPromptHasNoSecrets } from "../safety/validateSecrets.js";
import { AppError } from "../utils/errors.js";
import type { Runtime } from "../runtime/runtime.js";

export function registerExecuteRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post("/api/execute", async (req): Promise<ExecuteResponse> => {
    const body = ExecuteRequest.parse(req.body);
    if (runtime.isInstalling()) {
      throw new AppError("Foundry is installing — try again shortly", 423);
    }
    // The prompt is persisted with the session, so scan it here too — a direct
    // /api/execute call would otherwise bypass /api/prompt's secret check.
    if (body.prompt) assertPromptHasNoSecrets(body.prompt);
    // Serialize execution so concurrent requests can't race Anvil ownership.
    return runtime.runExclusive(() =>
      runPlan(runtime, body.plan, { baseSessionId: body.baseSessionId, prompt: body.prompt }),
    );
  });
}
