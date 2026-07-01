import {
  NetworkConfig,
  type ExecuteResponse,
  type Plan,
  type WorldManifest,
} from "@nightsmith/shared";
import { validateExtension } from "../manifest/extension.js";
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
  // If every action landed (an assertion may still have failed), the whole
  // manifest is live — record it as the base a following extend appends onto.
  if (!report.error && runtime.isRunning()) {
    runtime.setLiveSession(sessionId, manifest.actions.length);
  }
  saveSession({ id: sessionId, manifest, report });
  return { sessionId, report, state: runtime.getState() };
}

/**
 * Append a manifest's new actions onto the already-running world without
 * restarting Anvil. The manifest must be a strict extension of what is live
 * (see validateExtension); the persisted session manifest still grows as a
 * full-from-genesis spec, so replay stays deterministic.
 */
async function extendManifest(
  runtime: Runtime,
  rawManifest: WorldManifest,
  baseSessionId?: string,
): Promise<ExecuteResponse> {
  const liveId = runtime.getLiveSessionId();
  if (!runtime.isRunning() || !liveId) {
    throw new AppError(
      "Cannot extend: no running world. Create or run a world first.",
      409,
    );
  }
  if (baseSessionId && baseSessionId !== liveId) {
    throw new AppError(
      `Cannot extend: session "${baseSessionId}" is not the live world ("${liveId}").`,
      409,
    );
  }

  const next = validateManifest(rawManifest);
  validateNetwork(next.network);

  const applied = getSession(liveId).manifest;
  const appliedCount = runtime.getAppliedActionCount();
  validateExtension(applied, next, appliedCount); // throws 409 on any rewrite

  const appliedNames = new Set(applied.accounts.map((a) => a.name));
  const newAccounts = next.accounts.filter((a) => !appliedNames.has(a.name));

  // Apply the new action suffix with full rollback (chain + in-memory world)
  // if any action throws. `report.error` is set only when an ACTION fails; a
  // failed assertion (report.status "failed", no error) means the actions did
  // land on-chain, so — like a fresh run — we keep them and advance the cursor.
  const report = await runtime.appendIncremental(() =>
    executeManifest(runtime, next, {
      sessionId: liveId,
      incremental: { fromIndex: appliedCount, newAccounts },
    }),
  );

  if (report.error) {
    return { sessionId: liveId, report, state: runtime.getState() };
  }

  runtime.setLiveSession(liveId, next.actions.length);
  runtime.setLastManifest(next);
  saveSession({ id: liveId, manifest: next, report });
  return { sessionId: liveId, report, state: runtime.getState() };
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
export async function runPlan(
  runtime: Runtime,
  plan: Plan,
  opts: { baseSessionId?: string } = {},
): Promise<ExecuteResponse> {
  const { manifest } = validatePlanForExecution(plan);

  switch (plan.intent) {
    case "createWorld":
    case "modifyWorld":
    case "runScenario":
      return runManifest(runtime, manifest!);

    case "extendWorld":
      return extendManifest(runtime, manifest!, opts.baseSessionId);

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
