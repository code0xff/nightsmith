import type {
  AssertionResult,
  ExecutionReport,
  StepResult,
  WorldManifest,
} from "@blacksmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { errorMessage } from "../utils/errors.js";
import { setupAccounts } from "./accounts.js";
import { evaluateAssertion } from "./assertions.js";
import { describeAction, runAction } from "./scenarios.js";

export interface ExecuteOptions {
  sessionId: string;
  /** Restart Anvil for a clean, deterministic world (default true). */
  fresh?: boolean;
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

  runtime.setExecution("running", `Executing "${manifest.name}"`);
  runtime.setScenario({ name: manifest.name, status: "running", assertions: [] });
  runtime.log("info", `Executing world "${manifest.name}"`, "executor");

  try {
    if (runtime.isRunning() && opts.fresh !== false) {
      await runtime.stopLocalnet();
    }
    await step("Start Anvil", () =>
      runtime.startLocalnet(manifest.network, manifest.name),
    );
    await step("Set up accounts", () => setupAccounts(runtime, manifest.accounts));

    for (const action of manifest.actions) {
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
