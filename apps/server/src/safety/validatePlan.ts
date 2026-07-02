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
  // Scan everything EXCEPT the manifest for secrets. A 32-byte hex value is
  // indistinguishable from a private key by pattern alone, but it's also
  // completely normal on-chain data (a bytes32 role identifier, tx hash,
  // etc.) in a contract call's args or an assertion's expected value; those
  // fields are never usable as a signing key (accounts are always resolved by
  // name — see validateManifest), so scanning them only produces false
  // positives. `network.mnemonic` is the one manifest field a real secret
  // could meaningfully land in, and it's independently checked against the
  // public test mnemonic by validateNetwork. Excluding by field (rather than
  // allowlisting the free-text ones) means any new prose field added to Plan
  // later is covered automatically instead of silently bypassing the scan.
  const { manifest: _manifest, ...planWithoutManifest } = plan;
  const secretHits = scanForSecrets(JSON.stringify(planWithoutManifest));
  if (secretHits.length > 0) {
    throw new SafetyError("Plan contains secret-looking content", secretHits);
  }

  switch (plan.intent) {
    case "createWorld":
    case "modifyWorld":
    case "extendWorld":
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
