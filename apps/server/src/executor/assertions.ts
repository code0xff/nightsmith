import type { Assertion, AssertionResult } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { functionAbi, readFunction } from "./calls.js";
import { readTokenBalanceRaw } from "./tokens.js";
import { fromTokenUnits, toTokenUnits } from "./units.js";

/**
 * Normalize a call result (or the expected string) for stable equality, guided
 * by the ABI output type: integers -> decimal string, address -> lowercase
 * (only for actual `address` slots), bool/string/bytes as-is. Arrays/tuples and
 * multi-return functions fall back to bigint-safe JSON (best-effort).
 */
function normalizeTyped(value: unknown, type: string | undefined): string {
  if (type === "address" && typeof value === "string") return value.toLowerCase();
  if (type && (type.startsWith("uint") || type.startsWith("int"))) {
    return BigInt(String(value)).toString();
  }
  if (type === "bool") return String(value).toLowerCase() === "true" ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Evaluate a single assertion against the live chain state. */
export async function evaluateAssertion(
  runtime: Runtime,
  assertion: Assertion,
): Promise<AssertionResult> {
  switch (assertion.type) {
    case "tokenBalance": {
      const contract = runtime.getContract(assertion.contractId);
      const actualRaw = await readTokenBalanceRaw(
        runtime,
        assertion.contractId,
        assertion.account,
      );
      const expectedRaw = toTokenUnits(assertion.expected, contract.decimals);
      const passed = actualRaw === expectedRaw;
      const description =
        assertion.description ??
        `${assertion.account} holds ${assertion.expected} ${contract.symbol}`;
      return {
        description,
        passed,
        expected: `${assertion.expected} ${contract.symbol}`,
        actual: `${fromTokenUnits(actualRaw, contract.decimals)} ${contract.symbol}`,
      };
    }
    case "callResult": {
      const fn = functionAbi(runtime, assertion.contractId, assertion.function);
      const outType = fn.outputs.length === 1 ? fn.outputs[0]!.type : undefined;
      const raw = await readFunction(
        runtime,
        assertion.contractId,
        assertion.function,
        assertion.args,
      );
      const actual = normalizeTyped(raw, outType);
      const expected = normalizeTyped(assertion.expected, outType);
      return {
        description:
          assertion.description ??
          `${assertion.contractId}.${assertion.function}() == ${assertion.expected}`,
        passed: actual === expected,
        expected: assertion.expected,
        actual,
      };
    }
    default: {
      // Exhaustiveness guard for future assertion kinds.
      const _never: never = assertion;
      throw new Error(`Unsupported assertion type: ${JSON.stringify(_never)}`);
    }
  }
}
