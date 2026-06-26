import type { Abi, AbiFunction } from "viem";
import type { ArgValue, CallAction } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { coerceArgs } from "./args.js";
import { toWei } from "./units.js";

/** Find a single (non-overloaded) function by name in an ABI. */
function abiFunction(abi: Abi, name: string): AbiFunction {
  const fns = abi.filter(
    (item): item is AbiFunction => item.type === "function" && item.name === name,
  );
  if (fns.length === 0) throw new Error(`Function "${name}" not found in the contract ABI`);
  if (fns.length > 1) throw new Error(`Function "${name}" is overloaded — not supported yet`);
  return fns[0]!;
}

/** Execute a state-changing function call from a named signer. */
export async function callFunction(runtime: Runtime, action: CallAction): Promise<void> {
  const contract = runtime.getContract(action.contractId);
  const caller = runtime.getAccount(action.from);
  const wallet = runtime.walletFor(action.from);
  const fn = abiFunction(contract.abi, action.function);
  const args = coerceArgs(fn.inputs, action.args);

  const hash = await wallet.writeContract({
    address: contract.address,
    abi: contract.abi,
    functionName: action.function,
    args,
    account: caller.account,
    chain: runtime.getChain(),
    ...(action.value ? { value: toWei(action.value) } : {}),
  });
  const receipt = await runtime.getPublicClient().waitForTransactionReceipt({ hash });

  runtime.addTransaction({
    hash,
    ts: new Date().toISOString(),
    from: caller.address,
    to: contract.address,
    fn: action.function,
    status: receipt.status === "success" ? "success" : "reverted",
    gasUsed: receipt.gasUsed.toString(),
  });
  if (receipt.status !== "success") {
    throw new Error(`call ${action.function}() on ${action.contractId} reverted`);
  }
  runtime.log("success", `Called ${action.function}() on ${action.contractId} (from ${action.from})`, "executor");
}

/** Read a view/pure function and return its raw result. */
export async function readFunction(
  runtime: Runtime,
  contractId: string,
  fnName: string,
  args: ArgValue[],
): Promise<unknown> {
  const contract = runtime.getContract(contractId);
  const fn = abiFunction(contract.abi, fnName);
  const coerced = coerceArgs(fn.inputs, args);
  return runtime.getPublicClient().readContract({
    address: contract.address,
    abi: contract.abi,
    functionName: fnName,
    args: coerced,
  });
}
