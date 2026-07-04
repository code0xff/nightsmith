import { isAddress, type Assertion, type AssertionResult } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";
import { maxUint256, type AbiEvent } from "viem";
import { functionAbi, readFunction } from "./calls.js";
import { readAllowanceRaw, readTokenBalanceRaw } from "./tokens.js";
import { fromTokenUnits, fromWei, toTokenUnits, toTokenUnitsOrMax, toWei } from "./units.js";

/**
 * Normalize a call result (or the expected string) for stable equality, guided
 * by the ABI output type: integers -> decimal string, address -> lowercase
 * (only for actual `address` slots), bool/string/bytes as-is. Arrays/tuples and
 * multi-return functions fall back to bigint-safe JSON (best-effort).
 */
function normalizeTyped(value: unknown, type: string | undefined): string {
  // Scalar handling only for non-array types; arrays/tuples fall to the
  // bigint-safe JSON fallback below (so e.g. uint256[] doesn't hit BigInt()).
  if (type && !type.endsWith("]")) {
    if (type === "address" && typeof value === "string") return value.toLowerCase();
    // bytes/bytesN: viem decodes as lowercase hex; compare case-insensitively.
    if (type.startsWith("bytes") && typeof value === "string") return value.toLowerCase();
    if (type.startsWith("uint") || type.startsWith("int")) {
      return BigInt(String(value)).toString();
    }
    if (type === "bool") {
      // Only "true"/"false" are valid; an invalid value gets a sentinel so it
      // can't silently coerce to false and match a real `false` log.
      const s = String(value).toLowerCase();
      return s === "true" || s === "false" ? s : `bool?${String(value)}`;
    }
  }
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
      // An indexed dynamic arg (string/bytes/array/tuple) is stored as a topic
      // HASH, not its value — filtering by value would silently false-negative.
      for (const [name] of filters) {
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
      }

      const logs = await runtime.getPublicClient().getLogs({
        address: contract.address,
        event: eventAbi,
        fromBlock: 0n,
        toBlock: "latest",
      });
      const matches = logs.filter((log) => {
        const la = (log as { args?: Record<string, unknown> }).args ?? {};
        return filters.every(([name, expected]) => {
          const type = inputs.find((i) => i.name === name)?.type;
          // A named account in an address-typed arg resolves to its address.
          const exp =
            type === "address" && typeof expected === "string" && !isAddress(expected)
              ? runtime.resolveAddress(expected)
              : expected;
          return normalizeTyped(la[name], type) === normalizeTyped(exp, type);
        });
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
