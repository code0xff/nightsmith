import type { AbiParameter } from "viem";
import { isAddress, type Action, type Assertion, type WorldManifest } from "@nightsmith/shared";
import { MockERC20 } from "@nightsmith/contracts";
import { coerceArgs } from "../executor/args.js";

/**
 * Best-effort, ABI-driven preflight. Replays the executor's own validation
 * (arg count/type coercion, function lookup) against each contract's declared
 * ABI to surface — as non-blocking warnings — the errors a plan would hit at
 * run time: unknown/overloaded functions, wrong arg counts/types, ETH sent to
 * a non-payable function, result-assertions on state-mutating functions, etc.
 *
 * Fully dynamic (no token-specific assumptions) and never throws. It cannot
 * catch value-magnitude mistakes (a wrong-but-type-valid uint) — those surface
 * only from the real disposable-Anvil run and its assertion report.
 */
export function preflightManifest(manifest: WorldManifest): string[] {
  const warnings: string[] = [];
  const contracts = new Map<string, ResolvedAbi>();
  for (const c of manifest.contracts) {
    contracts.set(c.id, {
      kind: c.kind,
      abi: (c.kind === "artifact" ? c.abi : MockERC20.abi) as AbiItem[],
    });
  }

  // Declared account names resolve to addresses at run time, so they're valid
  // wherever a literal address is otherwise expected (call/read address args).
  const accountNames = new Set(manifest.accounts.map((a) => a.name));

  for (const action of manifest.actions) checkAction(action, contracts, warnings, accountNames);
  for (const assertion of manifest.assertions) checkAssertion(assertion, contracts, warnings);
  return warnings;
}

interface AbiItem {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: AbiParameter[];
}

interface ResolvedAbi {
  kind: string;
  abi: AbiItem[];
}

/** Coerce args exactly as the executor would; return the runtime error message, if any. */
function argError(inputs: AbiParameter[], args: readonly unknown[]): string | null {
  try {
    coerceArgs(inputs, args as never);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Warn about `address`/`address[]` args that are neither a declared account
 * name (resolved to an address at run time) nor a literal 0x address — matching
 * the runtime resolver's coverage (top-level address + address[] elements).
 */
function badAddressArgs(
  inputs: AbiParameter[],
  args: readonly unknown[],
  accountNames: Set<string>,
): string[] {
  const bad: string[] = [];
  const okAddr = (v: unknown) => typeof v === "string" && (accountNames.has(v) || isAddress(v));
  inputs.forEach((p, i) => {
    const v = args[i];
    if (p.type === "address") {
      if (!okAddr(v)) bad.push(p.name || `arg ${i}`);
    } else if (p.type === "address[]" && Array.isArray(v)) {
      if (!v.every(okAddr)) bad.push(p.name || `arg ${i}`);
    }
  });
  return bad;
}

function findFunctions(abi: AbiItem[], name: string): AbiItem[] {
  return abi.filter((i) => i.type === "function" && i.name === name);
}

function findEvents(abi: AbiItem[], name: string): AbiItem[] {
  return abi.filter((i) => i.type === "event" && i.name === name);
}

function checkAction(
  action: Action,
  contracts: Map<string, ResolvedAbi>,
  warnings: string[],
  accountNames: Set<string>,
): void {
  if (!("contractId" in action)) return; // chain-control actions (mine) target no contract
  const entry = contracts.get(action.contractId);
  if (!entry) return; // unknown contract is caught by validateManifest already
  const abi = entry.abi;

  if (action.type === "deployContract") {
    // Only artifact deploys pass action.args to the constructor; MockERC20
    // deploys derive ctor args from the manifest def (name/symbol/decimals),
    // so action.args is legitimately empty there.
    if (entry.kind !== "artifact") return;
    const ctor = abi.find((i) => i.type === "constructor");
    const err = argError(ctor?.inputs ?? [], action.args);
    if (err) warnings.push(`${action.contractId} constructor: ${err}`);
    return;
  }

  if (action.type === "call" || action.type === "read") {
    const fns = findFunctions(abi, action.function);
    if (fns.length === 0) {
      warnings.push(`${action.contractId}.${action.function}() is not in the contract ABI`);
      return;
    }
    if (fns.length > 1) {
      warnings.push(`${action.contractId}.${action.function}() is overloaded — not supported`);
      return;
    }
    const fn = fns[0]!;
    const inputs = fn.inputs ?? [];
    const err = argError(inputs, action.args);
    if (err) warnings.push(`${action.contractId}.${action.function}(): ${err}`);
    // call/read resolve named accounts in address args at run time, so only warn
    // for a value that's neither a declared account name nor a literal 0x.
    const badAddrs = badAddressArgs(inputs, action.args, accountNames);
    if (badAddrs.length > 0) {
      warnings.push(
        `${action.contractId}.${action.function}(): ${badAddrs.join(", ")} must be a named account or a literal 0x address`,
      );
    }
    // `read` targets a view/pure fn and sends no ETH — only `call` has `value`.
    if (action.type === "call" && action.value && fn.stateMutability !== "payable") {
      warnings.push(
        `${action.contractId}.${action.function}() is not payable but the action sends ETH — it will revert`,
      );
    }
    return;
  }

  // mint / transfer / approve map 1:1 to an ERC20 function named by action.type;
  // warn if the resolved ABI lacks it.
  if (findFunctions(abi, action.type).length === 0) {
    warnings.push(`${action.contractId} has no "${action.type}" function in its ABI`);
  }
}

function checkAssertion(
  assertion: Assertion,
  contracts: Map<string, ResolvedAbi>,
  warnings: string[],
): void {
  if (!("contractId" in assertion)) return; // native-ETH assertion targets no contract
  const abi = contracts.get(assertion.contractId)?.abi;
  if (!abi) return;

  if (assertion.type === "tokenBalance") {
    if (findFunctions(abi, "balanceOf").length === 0) {
      warnings.push(`${assertion.contractId} has no balanceOf() — cannot check a token balance`);
    }
    return;
  }

  if (assertion.type === "allowance") {
    if (findFunctions(abi, "allowance").length === 0) {
      warnings.push(`${assertion.contractId} has no allowance() — cannot check an allowance`);
    }
    return;
  }

  if (assertion.type === "event") {
    const events = findEvents(abi, assertion.event);
    if (events.length === 0) {
      warnings.push(`${assertion.contractId} has no "${assertion.event}" event in its ABI`);
    } else if (events.length > 1) {
      warnings.push(`${assertion.contractId}.${assertion.event} is an overloaded event — not supported`);
    }
    return;
  }

  // callResult
  const fns = findFunctions(abi, assertion.function);
  if (fns.length === 0) {
    warnings.push(`assertion ${assertion.contractId}.${assertion.function}() is not in the ABI`);
    return;
  }
  if (fns.length > 1) {
    warnings.push(`assertion ${assertion.contractId}.${assertion.function}() is overloaded — not supported`);
    return;
  }
  const fn = fns[0]!;
  const err = argError(fn.inputs ?? [], assertion.args);
  if (err) warnings.push(`assertion ${assertion.contractId}.${assertion.function}(): ${err}`);
  if (fn.stateMutability !== "view" && fn.stateMutability !== "pure") {
    warnings.push(
      `assertion ${assertion.contractId}.${assertion.function}() is not view/pure — its result isn't meaningful to assert`,
    );
  }
}
