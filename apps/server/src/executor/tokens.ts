import type { Runtime } from "../runtime/runtime.js";
import { MockErc20AbiForReads } from "./contracts.js";
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
    abi: MockErc20AbiForReads,
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
    abi: MockErc20AbiForReads,
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
  await refreshTokenBalance(runtime, contractId, toName);
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
    abi: MockErc20AbiForReads,
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
  await refreshTokenBalance(runtime, contractId, fromName);
  await refreshTokenBalance(runtime, contractId, toName);
  runtime.log(
    "success",
    `Transferred ${amount} ${contract.symbol}: ${fromName} → ${toName}`,
    "executor",
  );
}
