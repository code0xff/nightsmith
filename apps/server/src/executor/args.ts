import type { AbiParameter } from "viem";
import type { ArgValue } from "@nightsmith/shared";

/**
 * Coerce JSON-friendly arg values to viem-ready values using the ABI input
 * types: integers (decimal strings) -> bigint, bool, address/bytes/string ->
 * string, and arrays recursively. Tuples/structs are not supported yet.
 */
export function coerceArgs(
  inputs: readonly AbiParameter[],
  values: readonly ArgValue[],
): unknown[] {
  if (inputs.length !== values.length) {
    throw new Error(`expected ${inputs.length} argument(s), got ${values.length}`);
  }
  return inputs.map((param, i) => coerceArg(param, values[i]!));
}

function coerceArg(param: AbiParameter, value: ArgValue): unknown {
  const type = param.type;

  if (type.endsWith("[]")) {
    if (!Array.isArray(value)) {
      throw new Error(`arg "${param.name || type}": expected an array`);
    }
    const element = { ...param, type: type.slice(0, -2) } as AbiParameter;
    return value.map((v) => coerceArg(element, v));
  }
  if (type === "bool") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    throw new Error(`arg "${param.name || type}": expected a bool (true/false), got "${value}"`);
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    return BigInt(String(value));
  }
  if (type === "address" || type === "string" || type.startsWith("bytes")) {
    return String(value);
  }
  if (type === "tuple" || type.startsWith("tuple")) {
    throw new Error("tuple/struct arguments are not supported yet");
  }
  return value;
}
