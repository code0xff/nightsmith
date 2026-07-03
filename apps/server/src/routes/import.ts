import type { FastifyInstance } from "fastify";
import { ImportManifestRequest, type ExecuteResponse } from "@nightsmith/shared";
import { runSavedManifest } from "../executor/runPlan.js";
import { AppError } from "../utils/errors.js";
import type { Runtime } from "../runtime/runtime.js";

/**
 * Manifest import: load a raw (exported) manifest and replay it as a new
 * session — the inverse of export. The manifest is untrusted input, so it goes
 * through the same shape + network safety re-validation as replay/resume
 * (`runSavedManifest` → `runManifest`), not just the edge zod parse.
 */
export function registerImportRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.post("/api/import", async (req): Promise<ExecuteResponse> => {
    const body = ImportManifestRequest.parse(req.body);
    if (runtime.isInstalling()) {
      throw new AppError("Foundry is installing — try again shortly", 423);
    }
    // Serialize execution so concurrent requests can't race Anvil ownership.
    return runtime.runExclusive(() => runSavedManifest(runtime, body.manifest));
  });
}
