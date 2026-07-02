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

/**
 * True for `view`/`pure` functions. Also honors the pre-Solidity-0.6 `constant`
 * flag for ABIs that predate `stateMutability` (viem's `Abi` type doesn't
 * declare it, but an uploaded artifact's raw JSON may still carry it).
 */
function isReadOnly(item: { stateMutability?: string; constant?: boolean }): boolean {
  if (item.stateMutability) return item.stateMutability === "view" || item.stateMutability === "pure";
  return item.constant === true;
}

/** Whether an ABI declares a zero-arg view/pure function by this name whose single output matches. */
function hasNoArgView(abi: Abi, name: string, isValidOutput: (type: string) => boolean): boolean {
  return abi.some(
    (item) =>
      item.type === "function" &&
      item.name === name &&
      isReadOnly(item) &&
      item.inputs.length === 0 &&
      item.outputs.length === 1 &&
      isValidOutput(item.outputs[0]!.type),
  );
}

const isUintType = (type: string) => /^uint\d*$/.test(type);

/**
 * Best-effort read of `symbol()`/`decimals()` if the ABI declares them with
 * the expected shape — most ERC20-shaped uploads have these, but they're not
 * required, so any failure (missing/mismatched function, or a
 * declared-but-reverting one) falls back to blank metadata rather than
 * failing the deploy.
 */
async function readTokenMeta(
  publicClient: ReturnType<Runtime["getPublicClient"]>,
  address: `0x${string}`,
  abi: Abi,
): Promise<{ symbol: string; decimals: number }> {
  let symbol = "";
  let decimals = 0;
  if (hasNoArgView(abi, "symbol", (t) => t === "string")) {
    try {
      symbol = (await publicClient.readContract({ address, abi, functionName: "symbol" })) as string;
    } catch {
      // Not actually readable (e.g. reverts) — keep the blank fallback.
    }
  }
  if (hasNoArgView(abi, "decimals", isUintType)) {
    try {
      decimals = Number(
        await publicClient.readContract({ address, abi, functionName: "decimals" }),
      );
    } catch {
      // Same as above.
    }
  }
  return { symbol, decimals };
}

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

  const { symbol, decimals } = await readTokenMeta(publicClient, address, abi);

  runtime.registerContract({
    id: def.id,
    kind: def.kind,
    name: def.name,
    symbol,
    decimals,
    address,
    deployer,
    abi,
  });
  runtime.upsertContractState({
    id: def.id,
    kind: def.kind,
    name: def.name,
    symbol,
    decimals,
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
