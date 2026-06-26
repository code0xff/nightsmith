import type { Action, WorldManifest } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { callFunction } from "./calls.js";
import { deployArtifact, deployMockErc20 } from "./contracts.js";
import { mint, transfer } from "./tokens.js";

/** Human-readable label for a manifest action (used in reports/preview). */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "deployContract":
      return `Deploy ${action.contractId} (by ${action.deployer})`;
    case "mint":
      return `Mint ${action.amount} → ${action.to} (${action.contractId})`;
    case "transfer":
      return `Transfer ${action.amount}: ${action.from} → ${action.to} (${action.contractId})`;
    case "call":
      return `Call ${action.contractId}.${action.function}(${action.args.length ? "…" : ""}) by ${action.from}`;
  }
}

/** Execute a single manifest action against the running world. */
export async function runAction(
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
    case "call":
      await callFunction(runtime, action);
      return;
  }
}
