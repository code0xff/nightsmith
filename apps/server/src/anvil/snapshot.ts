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

/**
 * Set the exact timestamp (seconds) of the next mined block. Used instead of
 * evm_increaseTime because a fixed block-timestamp interval (for determinism)
 * ignores increaseTime; an absolute next-timestamp still takes effect.
 */
export async function setNextBlockTimestamp(
  client: PublicClient,
  timestampSec: number,
): Promise<void> {
  await raw(client)({ method: "evm_setNextBlockTimestamp", params: [timestampSec] });
}

/** Mine `blocks` block(s) immediately (test-only). */
export async function mineBlocks(client: PublicClient, blocks: number): Promise<void> {
  await raw(client)({ method: "anvil_mine", params: [numberToHex(blocks)] });
}

/**
 * Fix the seconds added to each new block's timestamp, so block times are a pure
 * function of the block height (not wall-clock) and replays are deterministic.
 */
export async function setBlockTimestampInterval(
  client: PublicClient,
  seconds: number,
): Promise<void> {
  await raw(client)({ method: "anvil_setBlockTimestampInterval", params: [seconds] });
}
