import type { Abi, AbiFunction } from "viem";
import type { ArgValue, CallAction, ReadAction } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { coerceArgs } from "./args.js";
import { normalizeTyped } from "./format.js";
import { runWrite } from "./sender.js";
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

/** Execute a state-changing function call. `from` may be a named signer or a
 *  literal address (impersonated). */
export async function callFunction(runtime: Runtime, action: CallAction): Promise<void> {
  const contract = runtime.getContract(action.contractId);
  const fn = abiFunction(contract.abi, action.function);
  const args = coerceArgs(fn.inputs, action.args);

  const { hash, receipt, from } = await runWrite(runtime, action.from, {
    address: contract.address,
    abi: contract.abi,
    functionName: action.function,
    args,
    ...(action.value ? { value: toWei(action.value) } : {}),
  });

  runtime.addTransaction({
    hash,
    ts: new Date().toISOString(),
    from,
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

/** Read a view/pure function and print its formatted result to the log console
 *  — a non-mutating query. No transaction is recorded. */
export async function readAndLog(runtime: Runtime, action: ReadAction): Promise<void> {
  const fn = abiFunction(runtime.getContract(action.contractId).abi, action.function);
  // Resolve a named account in a top-level address arg to its address, so
  // `balanceOf(["Bob"])` works (a literal 0x passes through unchanged).
  const args = action.args.map((a, i) =>
    fn.inputs[i]?.type === "address" && typeof a === "string" ? runtime.resolveAddress(a) : a,
  );
  const raw = await readFunction(runtime, action.contractId, action.function, args);
  const outType = fn.outputs.length === 1 ? fn.outputs[0]!.type : undefined;
  const value = normalizeTyped(raw, outType);
  const argsText = action.args
    .map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(", ");
  const call = `${action.contractId}.${action.function}(${argsText})`;
  runtime.log("info", `🔎 ${action.label ? `${action.label} — ` : ""}${call} → ${value}`, "read");
}

/** The (single, non-overloaded) ABI function entry for a contract — for typing results. */
export function functionAbi(runtime: Runtime, contractId: string, name: string): AbiFunction {
  return abiFunction(runtime.getContract(contractId).abi, name);
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
