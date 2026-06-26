import type { Assertion, AssertionResult } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { readFunction } from "./calls.js";
import { readTokenBalanceRaw } from "./tokens.js";
import { fromTokenUnits, toTokenUnits } from "./units.js";

/** Normalize a call result (or expected string) for stable equality compares. */
function normalize(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : value;
  }
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
      const raw = await readFunction(
        runtime,
        assertion.contractId,
        assertion.function,
        assertion.args,
      );
      const actual = normalize(raw);
      const expected = normalize(assertion.expected);
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
