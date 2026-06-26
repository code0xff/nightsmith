import type { Abi } from "viem";
import { MockERC20 } from "@nightsmith/contracts";
import type { MockErc20Def } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";

const mockErc20Abi = MockERC20.abi as Abi;

/**
 * Deploy a MockERC20 from the precompiled artifact and register it in the
 * runtime so later actions can reference it by id.
 */
export async function deployMockErc20(
  runtime: Runtime,
  def: MockErc20Def,
  deployer: string,
): Promise<`0x${string}`> {
  const wallet = runtime.walletFor(deployer);
  const account = runtime.getAccount(deployer);
  const publicClient = runtime.getPublicClient();

  const hash = await wallet.deployContract({
    abi: mockErc20Abi,
    bytecode: MockERC20.bytecode,
    args: [def.name, def.symbol, def.decimals],
    account: account.account,
    chain: runtime.getChain(),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Deployment of ${def.id} reverted`);
  }
  const address = receipt.contractAddress;
  if (!address) {
    throw new Error(`Deployment of ${def.id} produced no contract address`);
  }

  runtime.registerContract({
    id: def.id,
    kind: def.kind,
    name: def.name,
    symbol: def.symbol,
    decimals: def.decimals,
    address,
    deployer,
  });
  runtime.upsertContractState({
    id: def.id,
    kind: def.kind,
    name: def.name,
    symbol: def.symbol,
    decimals: def.decimals,
    address,
  });
  runtime.addTransaction({
    hash,
    ts: new Date().toISOString(),
    from: account.address,
    fn: "deploy",
    status: receipt.status === "success" ? "success" : "reverted",
    gasUsed: receipt.gasUsed.toString(),
  });
  runtime.log(
    "success",
    `Deployed ${def.symbol} (${def.name}) at ${address}`,
    "executor",
  );
  return address;
}

export const MockErc20AbiForReads = mockErc20Abi;
