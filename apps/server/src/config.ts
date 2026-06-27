/** Central configuration and well-known defaults. */

/** Port the Nightsmith web/REST server listens on. */
export const SERVER_PORT = Number(process.env.NIGHTSMITH_PORT ?? 4040);
/**
 * Host the server binds to. Defaults to loopback; set `NIGHTSMITH_HOST=0.0.0.0`
 * to expose it on the LAN. When binding to a non-loopback address you must also
 * set `NIGHTSMITH_ALLOWED_HOSTS` (see server.ts) so the Host-header guard lets
 * the request through.
 */
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

/**
 * Host Anvil binds to (its `--host`). Defaults to loopback so the funded test
 * chain isn't reachable off-box; set `NIGHTSMITH_ANVIL_HOST=0.0.0.0` to expose
 * it on the LAN. Only do this on a trusted network — Anvil unlocks well-known
 * accounts with no auth.
 */
export const ANVIL_HOST = process.env.NIGHTSMITH_ANVIL_HOST ?? "127.0.0.1";

/**
 * Host to *connect* to Anvil on. A wildcard bind (`0.0.0.0`/`::`) isn't a
 * dialable address, so the server always talks to its own Anvil over loopback.
 */
export const ANVIL_CONNECT_HOST =
  ANVIL_HOST === "0.0.0.0" || ANVIL_HOST === "::" ? "127.0.0.1" : ANVIL_HOST;

/** How long to wait for Anvil to become RPC-ready before giving up. */
export const ANVIL_READY_TIMEOUT_MS = 15_000;
