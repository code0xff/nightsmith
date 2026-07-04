import type { AbiParameter } from "viem";
import type { ArgValue } from "@nightsmith/shared";

/**
 * Coerce JSON-friendly arg values to viem-ready values using the ABI input
 * types: integers (decimal strings) -> bigint, bool, address/bytes/string ->
 * string, arrays (dynamic + fixed-size) recursively, and tuples/structs (an
 * object keyed by field name, or an ordered array) against their components.
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

  // Arrays: dynamic `T[]` or fixed-size `T[N]`. Strip one suffix and recurse.
  const arr = type.match(/^(.*)\[(\d*)\]$/);
  if (arr) {
    if (!Array.isArray(value)) {
      throw new Error(`arg "${param.name || type}": expected an array`);
    }
    if (arr[2] && value.length !== Number(arr[2])) {
      throw new Error(`arg "${param.name || type}": expected ${arr[2]} elements, got ${value.length}`);
    }
    const element = { ...param, type: arr[1] } as AbiParameter;
    return value.map((v) => coerceArg(element, v));
  }
  if (type === "tuple") {
    const components = (param as { components?: readonly AbiParameter[] }).components ?? [];
    if (Array.isArray(value)) {
      if (value.length !== components.length) {
        throw new Error(
          `tuple "${param.name || "arg"}": expected ${components.length} field(s), got ${value.length}`,
        );
      }
      return components.map((c, i) => coerceArg(c, value[i]!));
    }
    if (value !== null && typeof value === "object") {
      const obj = value as { [k: string]: ArgValue };
      const names = new Set(components.map((c) => c.name ?? ""));
      for (const key of Object.keys(obj)) {
        if (!names.has(key)) {
          throw new Error(`tuple "${param.name || "arg"}": unknown field "${key}"`);
        }
      }
      return components.map((c) => {
        const key = c.name ?? "";
        if (!(key in obj)) throw new Error(`tuple "${param.name || "arg"}": missing field "${key}"`);
        return coerceArg(c, obj[key]!);
      });
    }
    throw new Error(`tuple "${param.name || "arg"}": expected an object or array`);
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
  return value;
}
