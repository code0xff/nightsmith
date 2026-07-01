import type {
  AccountDef,
  AssertionResult,
  ExecutionReport,
  StepResult,
  WorldManifest,
} from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { AppError, errorMessage } from "../utils/errors.js";
import { setupAccounts } from "./accounts.js";
import { evaluateAssertion } from "./assertions.js";
import { describeAction, runAction } from "./scenarios.js";

export interface ExecuteOptions {
  sessionId: string;
  /** Restart Anvil for a clean, deterministic world (default true). */
  fresh?: boolean;
  /**
   * When set, append onto the already-running world instead of restarting:
   * skip the Anvil (re)start, fund only the new accounts, and run only the
   * action suffix from `fromIndex`. Assertions are always re-evaluated in full.
   */
  incremental?: {
    fromIndex: number;
    newAccounts: AccountDef[];
  };
}

/**
 * Deterministically execute a manifest end to end: (re)start Anvil, set up
 * accounts, run actions in order, evaluate assertions, and produce a report.
 * Every step streams logs/state to the UI via the runtime.
 */
export async function executeManifest(
  runtime: Runtime,
  manifest: WorldManifest,
  opts: ExecuteOptions,
): Promise<ExecutionReport> {
  const startedAt = new Date().toISOString();
  const steps: StepResult[] = [];
  const assertionResults: AssertionResult[] = [];

  const step = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      steps.push({ label, status: "ok" });
    } catch (err) {
      steps.push({ label, status: "failed", detail: errorMessage(err) });
      throw err;
    }
  };

  const inc = opts.incremental;
  runtime.setExecution("running", `Executing "${manifest.name}"`);
  runtime.setScenario({ name: manifest.name, status: "running", assertions: [] });
  runtime.log(
    "info",
    inc
      ? `Extending world "${manifest.name}" (+${manifest.actions.length - inc.fromIndex} actions)`
      : `Executing world "${manifest.name}"`,
    "executor",
  );

  try {
    if (inc) {
      // Append mode: keep the running Anvil (and its deployed contracts) and
      // only fund accounts that didn't exist before.
      if (!runtime.isRunning()) {
        throw new AppError("Cannot extend: localnet is not running", 409);
      }
      if (inc.newAccounts.length > 0) {
        await step("Set up new accounts", () => setupAccounts(runtime, inc.newAccounts));
      }
    } else {
      if (runtime.isRunning() && opts.fresh !== false) {
        await runtime.stopLocalnet();
      }
      await step("Start Anvil", () =>
        runtime.startLocalnet(manifest.network, manifest.name),
      );
      await step("Set up accounts", () => setupAccounts(runtime, manifest.accounts));
    }

    const actions = inc ? manifest.actions.slice(inc.fromIndex) : manifest.actions;
    for (const action of actions) {
      await step(describeAction(action), () => runAction(runtime, manifest, action));
    }

    for (const assertion of manifest.assertions) {
      const result = await evaluateAssertion(runtime, assertion);
      assertionResults.push(result);
      runtime.log(
        result.passed ? "success" : "error",
        `Assertion ${result.passed ? "passed" : "FAILED"}: ${result.description}` +
          (result.passed ? "" : ` (expected ${result.expected}, got ${result.actual})`),
        "executor",
      );
    }

    const allPassed = assertionResults.every((r) => r.passed);
    runtime.setScenario({
      name: manifest.name,
      status: allPassed ? "passed" : "failed",
      assertions: assertionResults,
    });
    await runtime.refreshChainStatus();

    const status: ExecutionReport["status"] = allPassed ? "completed" : "failed";
    runtime.setExecution(status === "completed" ? "completed" : "failed");
    runtime.log(
      status === "completed" ? "success" : "error",
      `Execution ${status} — ${assertionResults.filter((r) => r.passed).length}/${assertionResults.length} assertions passed`,
      "executor",
    );

    return {
      sessionId: opts.sessionId,
      manifestName: manifest.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
      steps,
      assertions: assertionResults,
      finalState: runtime.getState(),
    };
  } catch (err) {
    const message = errorMessage(err);
    runtime.setScenario({
      name: manifest.name,
      status: "failed",
      assertions: assertionResults,
    });
    runtime.setExecution("failed", message);
    runtime.log("error", `Execution failed: ${message}`, "executor");
    return {
      sessionId: opts.sessionId,
      manifestName: manifest.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      steps,
      assertions: assertionResults,
      finalState: runtime.getState(),
      error: message,
    };
  }
}
