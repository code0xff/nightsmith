import {
  NetworkConfig,
  type ExecuteResponse,
  type Plan,
  type WorldManifest,
} from "@nightsmith/shared";
import { validateManifest } from "../manifest/validate.js";
import { validateNetwork } from "../safety/validateNetwork.js";
import { validatePlanForExecution } from "../safety/validatePlan.js";
import {
  getSession,
  latestSession,
  newSessionId,
  saveSession,
} from "../sessions/store.js";
import type { Runtime } from "../runtime/runtime.js";
import { AppError } from "../utils/errors.js";
import { executeManifest } from "./executePlan.js";

const defaultNetwork = () => NetworkConfig.parse({ kind: "anvil-local" });

/** Run a manifest, persisting the session before and after execution. */
async function runManifest(
  runtime: Runtime,
  rawManifest: WorldManifest,
): Promise<ExecuteResponse> {
  // Re-validate here too: replay/resume load manifests straight from disk and
  // must not bypass shape/semantic/network safety checks.
  const manifest = validateManifest(rawManifest);
  validateNetwork(manifest.network);

  const sessionId = newSessionId(manifest.name);
  saveSession({ id: sessionId, manifest });
  const report = await executeManifest(runtime, manifest, { sessionId });
  runtime.setLastManifest(manifest);
  saveSession({ id: sessionId, manifest, report });
  return { sessionId, report, state: runtime.getState() };
}

/** Public entry for replaying/resuming a saved manifest (validated + run). */
export function runSavedManifest(
  runtime: Runtime,
  manifest: WorldManifest,
): Promise<ExecuteResponse> {
  return runManifest(runtime, manifest);
}

function manifestToReplay(runtime: Runtime): WorldManifest {
  const last = runtime.getLastManifest();
  if (last) return last;
  const latest = latestSession();
  if (latest) return getSession(latest.id).manifest;
  throw new AppError("Nothing to replay — no previous world found", 409);
}

/**
 * Validate and execute a confirmed plan. This is the single entry point shared
 * by the REST route, the headless demo, and the CLI. It assumes the user has
 * already reviewed and confirmed the plan.
 */
export async function runPlan(runtime: Runtime, plan: Plan): Promise<ExecuteResponse> {
  const { manifest } = validatePlanForExecution(plan);

  switch (plan.intent) {
    case "createWorld":
    case "modifyWorld":
    case "extendWorld":
    case "runScenario":
      // extendWorld runs as a full rebuild here; the live incremental path is
      // introduced in a later commit.
      return runManifest(runtime, manifest!);

    case "control": {
      const control = plan.control!;
      switch (control.kind) {
        case "stop":
          await runtime.stopLocalnet();
          break;
        case "start":
          await runtime.startLocalnet(defaultNetwork());
          break;
        case "reset":
          if (runtime.isRunning()) await runtime.stopLocalnet();
          await runtime.startLocalnet(defaultNetwork());
          break;
        case "snapshot":
          await runtime.snapshot();
          break;
        case "revert":
          await runtime.revert();
          break;
        case "replay":
        case "resume":
          return runManifest(runtime, manifestToReplay(runtime));
        case "export":
          // Export is a read-only client operation; nothing to execute here.
          runtime.log("info", "Use the Export control to download the manifest", "planner");
          break;
      }
      return { sessionId: null, report: null, state: runtime.getState() };
    }

    case "explain":
      runtime.log("info", plan.explanation ?? plan.summary, "planner");
      return { sessionId: null, report: null, state: runtime.getState() };
  }
}
