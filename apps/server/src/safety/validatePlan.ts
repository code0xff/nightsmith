import type { Plan } from "@nightsmith/shared";
import { SafetyError } from "../utils/errors.js";
import { validateManifest } from "../manifest/validate.js";
import { validateNetwork } from "./validateNetwork.js";
import { scanForSecrets } from "./validateSecrets.js";

export interface ValidatedPlan {
  plan: Plan;
  /** Present for create/modify/runScenario intents. */
  manifest: import("@nightsmith/shared").WorldManifest | null;
}

/**
 * Validate a plan immediately before execution: secrets scan, intent/shape
 * consistency, manifest validation, and network safety. Throws SafetyError on
 * any violation. This runs in addition to (not instead of) user confirmation.
 */
export function validatePlanForExecution(plan: Plan): ValidatedPlan {
  // No secrets may ride along in any plan field.
  const secretHits = scanForSecrets(JSON.stringify(plan));
  if (secretHits.length > 0) {
    throw new SafetyError("Plan contains secret-looking content", secretHits);
  }

  switch (plan.intent) {
    case "createWorld":
    case "modifyWorld":
    case "runScenario": {
      if (!plan.manifest) {
        throw new SafetyError(`Intent "${plan.intent}" requires a manifest`);
      }
      const manifest = validateManifest(plan.manifest);
      validateNetwork(manifest.network);
      return { plan, manifest };
    }
    case "control": {
      if (!plan.control) {
        throw new SafetyError('Intent "control" requires a control action');
      }
      return { plan, manifest: null };
    }
    case "explain": {
      return { plan, manifest: null };
    }
  }
}
