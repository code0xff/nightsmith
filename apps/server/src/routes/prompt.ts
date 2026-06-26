import type { FastifyInstance } from "fastify";
import {
  PromptRequest,
  type PromptResponse,
} from "@nightsmith/shared";
import { generatePlan } from "../ai/planner.js";
import { getSession } from "../sessions/store.js";
import { listArtifacts } from "../artifacts/store.js";
import { hydrateArtifacts } from "../artifacts/hydrate.js";
import { assertPromptHasNoSecrets } from "../safety/validateSecrets.js";
import type { Runtime } from "../runtime/runtime.js";

let planSeq = 0;

export function registerPromptRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post("/api/prompt", async (req): Promise<PromptResponse> => {
    const body = PromptRequest.parse(req.body);

    // Never send secrets to a provider.
    assertPromptHasNoSecrets(body.prompt);

    const previousManifest = body.sessionId
      ? getSession(body.sessionId).manifest
      : runtime.getLastManifest();

    runtime.setExecution("planning", "Generating plan…");
    const { plan, provider } = await generatePlan(
      {
        prompt: body.prompt,
        previousManifest,
        running: runtime.isRunning(),
        artifacts: listArtifacts(),
      },
      (level, message) => runtime.log(level, message, "planner"),
    );

    // Fill abi+bytecode for any artifact contracts the plan references by name.
    const finalPlan = plan.manifest
      ? { ...plan, manifest: hydrateArtifacts(plan.manifest) }
      : plan;

    runtime.setExecution("awaiting-confirmation");
    runtime.log("info", `Plan generated via ${provider}: ${finalPlan.summary}`, "planner");

    return { planId: `plan-${++planSeq}`, plan: finalPlan };
  });
}
