import type { FastifyInstance } from "fastify";
import { ExecuteRequest, type ExecuteResponse } from "@nightsmith/shared";
import { runPlan } from "../executor/runPlan.js";
import { AppError } from "../utils/errors.js";
import type { Runtime } from "../runtime/runtime.js";

export function registerExecuteRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post("/api/execute", async (req): Promise<ExecuteResponse> => {
    const body = ExecuteRequest.parse(req.body);
    if (runtime.isInstalling()) {
      throw new AppError("Foundry is installing — try again shortly", 423);
    }
    // Serialize execution so concurrent requests can't race Anvil ownership.
    return runtime.runExclusive(() => runPlan(runtime, body.plan));
  });
}
