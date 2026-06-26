import type { FastifyInstance } from "fastify";
import { ExecuteRequest, type ExecuteResponse } from "@blacksmith/shared";
import { runPlan } from "../executor/runPlan.js";
import type { Runtime } from "../runtime/runtime.js";

export function registerExecuteRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post("/api/execute", async (req): Promise<ExecuteResponse> => {
    const body = ExecuteRequest.parse(req.body);
    return runPlan(runtime, body.plan);
  });
}
