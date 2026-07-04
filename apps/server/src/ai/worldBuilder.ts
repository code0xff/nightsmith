import { formatUnits, parseUnits } from "viem";
import {
  isAddress,
  MANIFEST_VERSION,
  NetworkConfig,
  type Assertion,
  type WorldManifest,
} from "@nightsmith/shared";
import type { TokenPreset } from "./parse.js";

export interface WorldParams {
  name: string;
  token: TokenPreset;
  /** Recipients with their initial token balance. `ref` is a name or 0x address. */
  accounts: Array<{ ref: string; initial: string }>;
  /** Transfer: `from` is always a named account; `to` may be a name or address. */
  transfer: { from: string; to: string; amount: string } | null;
}

const DEPLOYER = "deployer";

/** Ordered, de-duplicated NAMED accounts (addresses get no AccountDef). */
function namedAccounts(params: WorldParams): string[] {
  const order: string[] = [];
  const seen = new Set<string>([DEPLOYER]);
  const push = (ref: string) => {
    if (isAddress(ref) || seen.has(ref)) return;
    seen.add(ref);
    order.push(ref);
  };
  for (const a of params.accounts) push(a.ref);
  if (params.transfer) {
    push(params.transfer.from); // sender must be a named, signable account
    push(params.transfer.to);
  }
  return order;
}

/** Every recipient/participant ref (names AND addresses), in order. */
function allRefs(params: WorldParams): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (ref: string) => {
    if (!seen.has(ref)) {
      seen.add(ref);
      order.push(ref);
    }
  };
  for (const a of params.accounts) push(a.ref);
  if (params.transfer) push(params.transfer.to);
  return order;
}

/** Simulate final token balances (base units) keyed by ref (name or address). */
function simulate(params: WorldParams): Map<string, bigint> {
  const d = params.token.decimals;
  const bal = new Map<string, bigint>();
  const add = (ref: string, delta: bigint) =>
    bal.set(ref, (bal.get(ref) ?? 0n) + delta);
  for (const ref of allRefs(params)) bal.set(ref, 0n);
  for (const a of params.accounts) add(a.ref, parseUnits(a.initial, d));
  if (params.transfer) {
    const amt = parseUnits(params.transfer.amount, d);
    add(params.transfer.from, -amt);
    add(params.transfer.to, amt);
  }
  return bal;
}

/** Build a complete, validated-shape manifest from world parameters. */
export function buildManifest(params: WorldParams): WorldManifest {
  const named = namedAccounts(params);
  const contractId = params.token.symbol.toLowerCase();

  const accounts = [
    { name: DEPLOYER, addressIndex: 0, fundEth: "0" },
    ...named.map((name, i) => ({ name, addressIndex: i + 1, fundEth: "0" })),
  ];

  const actions: WorldManifest["actions"] = [
    { type: "deployContract", contractId, deployer: DEPLOYER, args: [] },
  ];
  for (const a of params.accounts) {
    if (parseUnits(a.initial, params.token.decimals) > 0n) {
      actions.push({ type: "mint", contractId, to: a.ref, amount: a.initial });
    }
  }
  if (params.transfer) {
    actions.push({
      type: "transfer",
      contractId,
      from: params.transfer.from,
      to: params.transfer.to,
      amount: params.transfer.amount,
    });
  }

  const finals = simulate(params);
  const assertions: Assertion[] = [];
  for (const ref of allRefs(params)) {
    const raw = finals.get(ref) ?? 0n;
    if (raw < 0n) continue; // impossible world; executor will surface the revert
    const human = formatUnits(raw, params.token.decimals);
    assertions.push({
      type: "tokenBalance",
      contractId,
      account: ref,
      expected: human,
      description: `${ref} holds ${human} ${params.token.symbol}`,
    });
  }

  return {
    version: MANIFEST_VERSION,
    name: params.name,
    network: NetworkConfig.parse({ kind: "anvil-local" }),
    createdAt: new Date().toISOString(),
    accounts,
    contracts: [
      {
        id: contractId,
        kind: "MockERC20",
        name: params.token.name,
        symbol: params.token.symbol,
        decimals: params.token.decimals,
      },
    ],
    actions,
    assertions,
  };
}

/**
 * Fold a single-token manifest's mint/transfer actions into final balances
 * (base units), keyed by ref (name or 0x address). Used to regenerate balance
 * assertions after appending actions (extendWorld). Returns null for manifests
 * whose first contract isn't a MockERC20 (nothing to simulate deterministically).
 */
export function simulateBalances(
  manifest: WorldManifest,
): { contractId: string; symbol: string; decimals: number; balances: Map<string, bigint> } | null {
  const contract = manifest.contracts[0];
  if (!contract || contract.kind !== "MockERC20") return null;
  const { decimals } = contract;
  const balances = new Map<string, bigint>();
  const add = (ref: string, delta: bigint) =>
    balances.set(ref, (balances.get(ref) ?? 0n) + delta);
  for (const action of manifest.actions) {
    if (!("contractId" in action) || action.contractId !== contract.id) continue;
    if (action.type === "mint") add(action.to, parseUnits(action.amount, decimals));
    else if (action.type === "transfer") {
      const amt = parseUnits(action.amount, decimals);
      add(action.from, -amt);
      add(action.to, amt);
    }
  }
  return { contractId: contract.id, symbol: contract.symbol, decimals, balances };
}

/** Recover world parameters from an existing manifest (for modify/replay). */
export function deriveParams(manifest: WorldManifest): WorldParams {
  const contract = manifest.contracts[0];
  const token: TokenPreset =
    contract && contract.kind === "MockERC20"
      ? { name: contract.name, symbol: contract.symbol, decimals: contract.decimals }
      : { name: "Mock USDC", symbol: "USDC", decimals: 6 };

  // Recipients come from the mint actions (captures both named and addresses).
  const minted = new Map<string, bigint>();
  for (const action of manifest.actions) {
    if (action.type === "mint") {
      minted.set(
        action.to,
        (minted.get(action.to) ?? 0n) + parseUnits(action.amount, token.decimals),
      );
    }
  }
  const accounts = [...minted.entries()].map(([ref, raw]) => ({
    ref,
    initial: formatUnits(raw, token.decimals),
  }));

  // Keep refs that only appear as assertion targets (no mint) so a later
  // modify/replay doesn't silently drop them.
  const known = new Set(accounts.map((a) => a.ref));
  for (const assertion of manifest.assertions) {
    if (assertion.type === "tokenBalance" && !known.has(assertion.account)) {
      known.add(assertion.account);
      accounts.push({ ref: assertion.account, initial: "0" });
    }
  }

  const transferAction = manifest.actions.find((a) => a.type === "transfer");
  const transfer =
    transferAction && transferAction.type === "transfer"
      ? {
          from: transferAction.from,
          to: transferAction.to,
          amount: transferAction.amount,
        }
      : null;

  return { name: manifest.name, token, accounts, transfer };
}
