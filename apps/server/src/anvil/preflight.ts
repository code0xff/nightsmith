import { execa } from "execa";
import { AppError } from "../utils/errors.js";
import { locateAnvil } from "./locate.js";

const TTL_MS = 30_000;
let cached: { ok: boolean; checkedAt: number } | null = null;

/** Invalidate the availability cache (e.g. right after installing Foundry). */
export function resetAnvilCache(): void {
  cached = null;
}

export const ANVIL_INSTALL_HINT =
  "Anvil (Foundry) is not installed or not on PATH. Install it from " +
  "https://book.getfoundry.sh/getting-started/installation and run `foundryup`.";

/**
 * Whether the `anvil` binary is runnable. Cached with a short TTL so installing
 * Foundry after the server starts is picked up without a restart.
 */
export async function isAnvilInstalled(): Promise<boolean> {
  if (cached && Date.now() - cached.checkedAt < TTL_MS) return cached.ok;
  let ok = false;
  try {
    await execa(locateAnvil(), ["--version"], { timeout: 5000 });
    ok = true;
  } catch {
    ok = false;
  }
  cached = { ok, checkedAt: Date.now() };
  return ok;
}

/**
 * Fail fast with an actionable message when Anvil is missing, instead of
 * spawning a non-existent binary and timing out waiting for its RPC.
 */
export async function assertAnvilInstalled(): Promise<void> {
  if (!(await isAnvilInstalled())) {
    throw new AppError(ANVIL_INSTALL_HINT, 503);
  }
}
