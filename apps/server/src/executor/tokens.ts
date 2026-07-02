import type { Abi } from "viem";
import type { WorldManifest } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { fromTokenUnits, toTokenUnits } from "./units.js";

/** Read an account's token balance (base units). */
export async function readTokenBalanceRaw(
  runtime: Runtime,
  contractId: string,
  accountName: string,
): Promise<bigint> {
  const contract = runtime.getContract(contractId);
  const balance = await runtime.getPublicClient().readContract({
    address: contract.address,
    abi: contract.abi,
    functionName: "balanceOf",
    args: [runtime.resolveAddress(accountName)],
  });
  return balance as bigint;
}

/** Read a balance and push it into the live world state. */
export async function refreshTokenBalance(
  runtime: Runtime,
  contractId: string,
  accountName: string,
): Promise<void> {
  const contract = runtime.getContract(contractId);
  const raw = await readTokenBalanceRaw(runtime, contractId, accountName);
  runtime.upsertTokenBalance({
    contractId,
    symbol: contract.symbol,
    account: accountName,
    balance: fromTokenUnits(raw, contract.decimals),
  });
}

/**
 * True for `view`/`pure` functions. Also honors the pre-Solidity-0.6 `constant`
 * flag for ABIs that predate `stateMutability` (viem's `Abi` type doesn't
 * declare it, but an uploaded artifact's raw JSON may still carry it).
 */
function isReadOnly(item: { stateMutability?: string; constant?: boolean }): boolean {
  if (item.stateMutability) return item.stateMutability === "view" || item.stateMutability === "pure";
  return item.constant === true;
}

/** Whether an ABI looks like an ERC20 (exposes `balanceOf(address) view -> uint256`). */
function isTokenLike(abi: Abi): boolean {
  return abi.some(
    (item) =>
      item.type === "function" &&
      item.name === "balanceOf" &&
      isReadOnly(item) &&
      item.inputs.length === 1 &&
      item.inputs[0]?.type === "address" &&
      item.outputs.length === 1 &&
      item.outputs[0]?.type === "uint256",
  );
}

/**
 * Refresh every named account's balance for every already-deployed,
 * token-shaped contract in the manifest. Called after every action so the
 * live panel stays in sync regardless of how a contract's balances changed
 * (mint/transfer, or a generic `call` — e.g. a custom uploaded ERC20).
 */
export async function refreshAllTokenBalances(
  runtime: Runtime,
  manifest: WorldManifest,
): Promise<void> {
  for (const def of manifest.contracts) {
    let contract;
    try {
      contract = runtime.getContract(def.id);
    } catch {
      continue; // not deployed yet
    }
    if (!isTokenLike(contract.abi)) continue;
    for (const account of manifest.accounts) {
      await refreshTokenBalance(runtime, def.id, account.name);
    }
  }
}

export async function mint(
  runtime: Runtime,
  contractId: string,
  toName: string,
  amount: string,
): Promise<void> {
  const contract = runtime.getContract(contractId);
  const toAddress = runtime.resolveAddress(toName);
  const caller = runtime.getAccount(contract.deployer);
  const wallet = runtime.walletFor(contract.deployer);

  const hash = await wallet.writeContract({
    address: contract.address,
    abi: contract.abi,
    functionName: "mint",
    args: [toAddress, toTokenUnits(amount, contract.decimals)],
    account: caller.account,
    chain: runtime.getChain(),
  });
  const receipt = await runtime.getPublicClient().waitForTransactionReceipt({ hash });

  runtime.addTransaction({
    hash,
    ts: new Date().toISOString(),
    from: caller.address,
    to: contract.address,
    fn: "mint",
    status: receipt.status === "success" ? "success" : "reverted",
    gasUsed: receipt.gasUsed.toString(),
  });
  if (receipt.status !== "success") {
    throw new Error(`mint of ${amount} ${contract.symbol} to ${toName} reverted`);
  }
  runtime.log(
    "success",
    `Minted ${amount} ${contract.symbol} to ${toName}`,
    "executor",
  );
}

export async function transfer(
  runtime: Runtime,
  contractId: string,
  fromName: string,
  toName: string,
  amount: string,
): Promise<void> {
  const contract = runtime.getContract(contractId);
  const from = runtime.getAccount(fromName);
  const toAddress = runtime.resolveAddress(toName);
  const wallet = runtime.walletFor(fromName);

  const hash = await wallet.writeContract({
    address: contract.address,
    abi: contract.abi,
    functionName: "transfer",
    args: [toAddress, toTokenUnits(amount, contract.decimals)],
    account: from.account,
    chain: runtime.getChain(),
  });
  const receipt = await runtime.getPublicClient().waitForTransactionReceipt({ hash });

  runtime.addTransaction({
    hash,
    ts: new Date().toISOString(),
    from: from.address,
    to: contract.address,
    fn: "transfer",
    status: receipt.status === "success" ? "success" : "reverted",
    gasUsed: receipt.gasUsed.toString(),
  });
  if (receipt.status !== "success") {
    throw new Error(
      `transfer of ${amount} ${contract.symbol} from ${fromName} to ${toName} reverted`,
    );
  }
  runtime.log(
    "success",
    `Transferred ${amount} ${contract.symbol}: ${fromName} → ${toName}`,
    "executor",
  );
}
