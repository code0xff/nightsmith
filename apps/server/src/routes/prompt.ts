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
import { preflightManifest } from "../safety/preflightManifest.js";
import { AppError } from "../utils/errors.js";
import type { Runtime } from "../runtime/runtime.js";

let planSeq = 0;

export function registerPromptRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post("/api/prompt", async (req, reply): Promise<PromptResponse> => {
    const body = PromptRequest.parse(req.body);

    // Never send secrets to a provider.
    assertPromptHasNoSecrets(body.prompt);

    const previousManifest = body.sessionId
      ? getSession(body.sessionId).manifest
      : runtime.getLastManifest();

    // Cancel the in-flight provider work if the client disconnects (Stop).
    // Listen on the RESPONSE stream: ServerResponse "close" fires on a client
    // disconnect mid-handler (before we've written a response); `writableEnded`
    // distinguishes that from a normal completed response.
    const abort = new AbortController();
    const onClose = () => {
      if (!reply.raw.writableEnded) abort.abort();
    };
    reply.raw.on("close", onClose);

    runtime.setExecution("planning", "Generating plan…");
    try {
      const { plan, provider } = await generatePlan(
        {
          prompt: body.prompt,
          previousManifest,
          running: runtime.isRunning(),
          artifacts: listArtifacts(),
        },
        (level, message) => runtime.log(level, message, "planner"),
        abort.signal,
      );

      // Fill abi+bytecode for any artifact contracts the plan references by name.
      const finalPlan = plan.manifest
        ? { ...plan, manifest: hydrateArtifacts(plan.manifest) }
        : plan;

      // ABI-conformance preflight (advisory — surfaced in the preview, non-blocking).
      const warnings = finalPlan.manifest ? preflightManifest(finalPlan.manifest) : [];
      for (const w of warnings) runtime.log("warning", w, "planner");

      runtime.setExecution("awaiting-confirmation");
      runtime.log("info", `Plan generated via ${provider}: ${finalPlan.summary}`, "planner");

      return { planId: `plan-${++planSeq}`, plan: finalPlan, warnings };
    } catch (err) {
      if (abort.signal.aborted) {
        runtime.setExecution("idle");
        runtime.log("warning", "Planning cancelled", "planner");
        throw new AppError("Planning cancelled", 499);
      }
      throw err;
    } finally {
      reply.raw.off("close", onClose);
    }
  });
}
