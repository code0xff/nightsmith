import type { PublicClient, Hex } from "viem";
import { numberToHex } from "viem";

/**
 * Anvil-specific JSON-RPC helpers. viem's typed `request` doesn't know these
 * test-only methods, so we issue them through the transport directly.
 */
type RawRequest = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

function raw(client: PublicClient): RawRequest {
  return client.request as unknown as RawRequest;
}

/** Take an EVM snapshot; returns the snapshot id. */
export async function takeSnapshot(client: PublicClient): Promise<string> {
  const id = await raw(client)({ method: "evm_snapshot" });
  return String(id);
}

/** Revert to a previously taken snapshot. Returns whether it succeeded. */
export async function revertSnapshot(
  client: PublicClient,
  id: string,
): Promise<boolean> {
  const ok = await raw(client)({ method: "evm_revert", params: [id] });
  return Boolean(ok);
}

/** Set an account's ETH balance (test-only). */
export async function setBalance(
  client: PublicClient,
  address: Hex,
  weiBalance: bigint,
): Promise<void> {
  await raw(client)({
    method: "anvil_setBalance",
    params: [address, numberToHex(weiBalance)],
  });
}
