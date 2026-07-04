import type { Action, MineAction, WorldManifest } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { mineBlocks, setNextBlockTimestamp } from "../anvil/snapshot.js";
import { callFunction } from "./calls.js";
import { deployArtifact, deployMockErc20 } from "./contracts.js";
import { approve, mint, refreshAllTokenBalances, transfer } from "./tokens.js";

/** Human-readable label for a manifest action (used in reports/preview). */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "deployContract":
      return `Deploy ${action.contractId} (by ${action.deployer})`;
    case "mint":
      return `Mint ${action.amount} → ${action.to} (${action.contractId})`;
    case "transfer":
      return `Transfer ${action.amount}: ${action.from} → ${action.to} (${action.contractId})`;
    case "approve":
      return `Approve ${action.amount === "max" ? "unlimited" : action.amount}: ${action.owner} → ${action.spender} (${action.contractId})`;
    case "mine":
      return `Mine ${action.blocks} block${action.blocks === 1 ? "" : "s"}${action.secondsDelta ? `, +${action.secondsDelta}s` : ""}`;
    case "call":
      return `Call ${action.contractId}.${action.function}(${action.args.length ? "…" : ""}) by ${action.from}`;
  }
}

/** Advance time and/or mine blocks against the running Anvil. */
async function runMine(runtime: Runtime, action: MineAction): Promise<void> {
  const client = runtime.getPublicClient();
  if (action.secondsDelta > 0) {
    // Absolute next timestamp = current + delta (deterministic: current is a
    // function of block height under the fixed interval, not wall-clock).
    const current = await client.getBlock();
    await setNextBlockTimestamp(client, Number(current.timestamp) + action.secondsDelta);
  }
  await mineBlocks(client, action.blocks);
  await runtime.refreshChainStatus();
  runtime.log(
    "success",
    `Mined ${action.blocks} block${action.blocks === 1 ? "" : "s"}${action.secondsDelta ? ` (+${action.secondsDelta}s)` : ""}`,
    "executor",
  );
}

async function runSingleAction(
  runtime: Runtime,
  manifest: WorldManifest,
  action: Action,
): Promise<void> {
  switch (action.type) {
    case "deployContract": {
      const def = manifest.contracts.find((c) => c.id === action.contractId);
      if (!def) {
        throw new Error(`Action references unknown contract "${action.contractId}"`);
      }
      if (def.kind === "MockERC20") {
        await deployMockErc20(runtime, def, action.deployer);
        return;
      }
      if (def.kind === "artifact") {
        await deployArtifact(runtime, def, action.deployer, action.args);
        return;
      }
      throw new Error(`Unsupported contract kind for deploy: ${(def as { kind: string }).kind}`);
    }
    case "mint":
      await mint(runtime, action.contractId, action.to, action.amount);
      return;
    case "transfer":
      await transfer(runtime, action.contractId, action.from, action.to, action.amount);
      return;
    case "approve":
      await approve(runtime, action.contractId, action.owner, action.spender, action.amount);
      return;
    case "mine":
      await runMine(runtime, action);
      return;
    case "call":
      await callFunction(runtime, action);
      return;
  }
}

/**
 * Execute a single manifest action against the running world, then refresh
 * every token-shaped contract's balances for every named account — so the
 * live panel stays in sync regardless of which action type moved tokens
 * (mint/transfer, or a generic `call` on a custom uploaded ERC20).
 */
export async function runAction(
  runtime: Runtime,
  manifest: WorldManifest,
  action: Action,
): Promise<void> {
  await runSingleAction(runtime, manifest, action);
  await refreshAllTokenBalances(runtime, manifest);
}
