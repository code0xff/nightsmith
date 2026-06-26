import type { Assertion, AssertionResult } from "@blacksmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { readTokenBalanceRaw } from "./tokens.js";
import { fromTokenUnits, toTokenUnits } from "./units.js";

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
    default: {
      // Exhaustiveness guard for future assertion kinds.
      const _never: never = assertion.type;
      throw new Error(`Unsupported assertion type: ${String(_never)}`);
    }
  }
}
