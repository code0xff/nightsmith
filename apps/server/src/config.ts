/** Central configuration and well-known defaults. */

/** Port the Nightsmith web/REST server listens on. */
export const SERVER_PORT = Number(process.env.NIGHTSMITH_PORT ?? 4040);
export const SERVER_HOST = process.env.NIGHTSMITH_HOST ?? "127.0.0.1";

/** Default Anvil RPC port. */
export const DEFAULT_ANVIL_PORT = Number(process.env.NIGHTSMITH_ANVIL_PORT ?? 8545);
export const DEFAULT_CHAIN_ID = 31337;

/**
 * Anvil's well-known deterministic dev mnemonic. The accounts it derives are
 * PUBLIC test keys (documented by Foundry) — never real secrets. Nightsmith
 * only ever uses these for local execution.
 */
export const ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";

export const ANVIL_HOST = "127.0.0.1";

/** How long to wait for Anvil to become RPC-ready before giving up. */
export const ANVIL_READY_TIMEOUT_MS = 15_000;
