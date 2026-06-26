import type { NetworkConfig } from "@blacksmith/shared";
import { ANVIL_MNEMONIC } from "../config.js";
import { SafetyError } from "../utils/errors.js";

const ALLOW_FORK = process.env.BLACKSMITH_ALLOW_FORK === "true";
const ALLOW_BROADCAST = process.env.BLACKSMITH_ALLOW_BROADCAST === "true";

/**
 * Enforce local-only execution. Forking or broadcasting beyond the local node
 * is rejected unless explicitly opted in via environment flags.
 */
export function validateNetwork(network: NetworkConfig): void {
  const problems: string[] = [];

  if (network.kind !== "anvil-local") {
    problems.push(`unsupported network kind "${network.kind}"`);
  }
  if (network.forkUrl && !ALLOW_FORK) {
    problems.push(
      "forking a remote network requires BLACKSMITH_ALLOW_FORK=true (default is local-only)",
    );
  }
  if (network.broadcast && !ALLOW_BROADCAST) {
    problems.push(
      "broadcasting beyond the local node requires BLACKSMITH_ALLOW_BROADCAST=true",
    );
  }
  // A custom mnemonic could carry a real seed phrase into Anvil's output and
  // persisted manifests. Only the well-known public test mnemonic is allowed.
  if (network.mnemonic && network.mnemonic !== ANVIL_MNEMONIC) {
    problems.push(
      "custom mnemonics are not allowed; Blacksmith uses Anvil's public test mnemonic only",
    );
  }

  if (problems.length > 0) {
    throw new SafetyError("Network configuration rejected by safety policy", problems);
  }
}
