import { isAddress, type Assertion, type AssertionResult } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { maxUint256, type AbiEvent } from "viem";
import { functionAbi, readFunction, resolveNamedAddressArgs } from "./calls.js";
import { normalizeTyped } from "./format.js";
import { readAllowanceRaw, readTokenBalanceRaw } from "./tokens.js";
import { fromTokenUnits, fromWei, toTokenUnits, toTokenUnitsOrMax, toWei } from "./units.js";

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
    case "allowance": {
      const contract = runtime.getContract(assertion.contractId);
      const actualRaw = await readAllowanceRaw(
        runtime,
        assertion.contractId,
        assertion.owner,
        assertion.spender,
      );
      const expectedRaw = toTokenUnitsOrMax(assertion.expected, contract.decimals);
      const passed = actualRaw === expectedRaw;
      // uint256-max reads back as an astronomical decimal; show "max" instead.
      const fmt = (raw: bigint) =>
        raw === maxUint256 ? "max" : `${fromTokenUnits(raw, contract.decimals)} ${contract.symbol}`;
      const expectedLabel = assertion.expected === "max" ? "unlimited" : assertion.expected;
      return {
        description:
          assertion.description ??
          `${assertion.spender} may spend ${expectedLabel} ${contract.symbol} of ${assertion.owner}`,
        passed,
        expected: assertion.expected === "max" ? "max" : `${assertion.expected} ${contract.symbol}`,
        actual: fmt(actualRaw),
      };
    }
    case "ethBalance": {
      const address = runtime.resolveAddress(assertion.account);
      const actualWei = await runtime.getPublicClient().getBalance({ address });
      const expectedWei = toWei(assertion.expected);
      return {
        description:
          assertion.description ?? `${assertion.account} holds ${assertion.expected} ETH`,
        passed: actualWei === expectedWei,
        expected: `${assertion.expected} ETH`,
        actual: `${fromWei(actualWei)} ETH`,
      };
    }
    case "callResult": {
      const fn = functionAbi(runtime, assertion.contractId, assertion.function);
      const outType = fn.outputs.length === 1 ? fn.outputs[0]!.type : undefined;
      const raw = await readFunction(
        runtime,
        assertion.contractId,
        assertion.function,
        resolveNamedAddressArgs(runtime, fn.inputs, assertion.args),
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
    case "event": {
      const contract = runtime.getContract(assertion.contractId);
      const filters = Object.entries(assertion.args);
      const filterDesc = filters.length
        ? ` where ${filters.map(([k, v]) => `${k}=${v}`).join(", ")}`
        : "";
      const target = assertion.count !== undefined ? `exactly ${assertion.count}` : "at least 1";
      const description =
        assertion.description ?? `${assertion.contractId} emits ${assertion.event}${filterDesc}`;
      const fail = (actual: string): AssertionResult => ({
        description,
        passed: false,
        expected: `${target} ${assertion.event} event(s)`,
        actual,
      });

      const eventAbis = contract.abi.filter(
        (i) =>
          (i as { type?: string }).type === "event" &&
          (i as { name?: string }).name === assertion.event,
      ) as AbiEvent[];
      if (eventAbis.length === 0) {
        return fail(`no "${assertion.event}" event in ${assertion.contractId}'s ABI`);
      }
      if (eventAbis.length > 1) {
        return fail(`"${assertion.event}" is an overloaded event — not supported`);
      }
      const eventAbi = eventAbis[0]!;
      const inputs = (eventAbi.inputs ?? []) as {
        name?: string;
        type?: string;
        indexed?: boolean;
      }[];
      // Validate + pre-resolve every filter up front (so a bad filter is a clean
      // assertion failure, not a crash mid-scan).
      const resolved: { name: string; expected: unknown; type: string }[] = [];
      for (const [name, expected] of filters) {
        const inp = inputs.find((i) => i.name === name);
        // A typo'd/unknown arg name would never match any log — reject it up
        // front rather than silently counting 0 (a false positive for count:0).
        if (!inp) {
          return fail(`unknown arg "${name}" for event ${assertion.event}`);
        }
        const t = inp.type ?? "";
        // Indexed dynamic values (string, bytes, ANY array incl. fixed-size, or
        // tuple) are stored as a topic hash, not the value — can't filter by value.
        const isArray = /\[\d*\]$/.test(t);
        if (inp.indexed && (t === "string" || t === "bytes" || isArray || t.startsWith("tuple"))) {
          return fail(`cannot filter on indexed dynamic arg "${name}" (it's stored as a hash)`);
        }
        let exp: unknown = expected;
        if (t === "address" && typeof expected === "string" && !isAddress(expected)) {
          // A named account resolves to its address; an unknown name is a clean fail.
          try {
            exp = runtime.resolveAddress(expected);
          } catch {
            return fail(`unknown account "${expected}" for arg "${name}"`);
          }
        }
        resolved.push({ name, expected: exp, type: t });
      }

      const logs = await runtime.getPublicClient().getLogs({
        address: contract.address,
        event: eventAbi,
        fromBlock: 0n,
        toBlock: "latest",
      });
      const matches = logs.filter((log) => {
        const la = (log as { args?: Record<string, unknown> }).args ?? {};
        return resolved.every(
          ({ name, expected, type }) => normalizeTyped(la[name], type) === normalizeTyped(expected, type),
        );
      });
      const count = matches.length;
      const passed = assertion.count !== undefined ? count === assertion.count : count >= 1;
      return { description, passed, expected: `${target} ${assertion.event} event(s)`, actual: `${count} emitted` };
    }
    default: {
      // Exhaustiveness guard for future assertion kinds.
      const _never: never = assertion;
      throw new Error(`Unsupported assertion type: ${JSON.stringify(_never)}`);
    }
  }
}
