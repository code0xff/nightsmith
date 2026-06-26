import type { Abi, AbiParameter } from "viem";
import { MockERC20 } from "@nightsmith/contracts";
import type { ArgValue, ArtifactContractDef, MockErc20Def } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { coerceArgs } from "./args.js";

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
    abi: mockErc20Abi,
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

/** Deploy a user-uploaded artifact with constructor args (no runtime solc). */
export async function deployArtifact(
  runtime: Runtime,
  def: ArtifactContractDef,
  deployer: string,
  args: ArgValue[],
): Promise<`0x${string}`> {
  const wallet = runtime.walletFor(deployer);
  const account = runtime.getAccount(deployer);
  const publicClient = runtime.getPublicClient();
  const abi = def.abi as unknown as Abi;

  const ctor = abi.find((item) => (item as { type?: string }).type === "constructor") as
    | { inputs?: readonly AbiParameter[] }
    | undefined;
  const coerced = coerceArgs(ctor?.inputs ?? [], args);

  const hash = await wallet.deployContract({
    abi,
    bytecode: def.bytecode as `0x${string}`,
    args: coerced,
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
    symbol: "",
    decimals: 0,
    address,
    deployer,
    abi,
  });
  runtime.upsertContractState({
    id: def.id,
    kind: def.kind,
    name: def.name,
    symbol: "",
    decimals: 0,
    address,
  });
  runtime.addTransaction({
    hash,
    ts: new Date().toISOString(),
    from: account.address,
    fn: "deploy",
    status: "success",
    gasUsed: receipt.gasUsed.toString(),
  });
  runtime.log("success", `Deployed ${def.name} at ${address}`, "executor");
  return address;
}
