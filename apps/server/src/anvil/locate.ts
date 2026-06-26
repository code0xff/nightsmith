import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Foundry installs binaries here by default. */
export function foundryBinDir(): string {
  return process.env.FOUNDRY_BIN_DIR ?? join(homedir(), ".foundry", "bin");
}

/**
 * The command to invoke Anvil. Prefers the absolute path in ~/.foundry/bin so a
 * just-installed Anvil works even before the shell PATH is reloaded; otherwise
 * falls back to "anvil" on PATH.
 */
export function locateAnvil(): string {
  const direct = join(foundryBinDir(), "anvil");
  return existsSync(direct) ? direct : "anvil";
}
