import { formatUnits, parseUnits } from "viem";
import {
  MANIFEST_VERSION,
  NetworkConfig,
  type Assertion,
  type WorldManifest,
} from "@blacksmith/shared";
import type { TokenPreset } from "./parse.js";

export interface WorldParams {
  name: string;
  token: TokenPreset;
  /** Named accounts with their initial token balance (decimal string). */
  accounts: Array<{ name: string; initial: string }>;
  transfer: { from: string; to: string; amount: string } | null;
}

const DEPLOYER = "deployer";

/** Ordered, de-duplicated list of named (non-deployer) accounts. */
function namedAccounts(params: WorldParams): string[] {
  const order: string[] = [];
  const seen = new Set<string>([DEPLOYER]);
  const push = (n: string) => {
    if (!seen.has(n)) {
      seen.add(n);
      order.push(n);
    }
  };
  for (const a of params.accounts) push(a.name);
  if (params.transfer) {
    push(params.transfer.from);
    push(params.transfer.to);
  }
  return order;
}

/** Simulate final token balances (base units) from initials + transfer. */
function simulate(params: WorldParams): Map<string, bigint> {
  const d = params.token.decimals;
  const bal = new Map<string, bigint>();
  for (const name of namedAccounts(params)) bal.set(name, 0n);
  for (const a of params.accounts) {
    bal.set(a.name, (bal.get(a.name) ?? 0n) + parseUnits(a.initial, d));
  }
  if (params.transfer) {
    const amt = parseUnits(params.transfer.amount, d);
    bal.set(params.transfer.from, (bal.get(params.transfer.from) ?? 0n) - amt);
    bal.set(params.transfer.to, (bal.get(params.transfer.to) ?? 0n) + amt);
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
    { type: "deployContract", contractId, deployer: DEPLOYER },
  ];
  for (const a of params.accounts) {
    if (parseUnits(a.initial, params.token.decimals) > 0n) {
      actions.push({ type: "mint", contractId, to: a.name, amount: a.initial });
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
  for (const name of named) {
    const raw = finals.get(name) ?? 0n;
    if (raw < 0n) continue; // impossible world; executor will surface the revert
    assertions.push({
      type: "tokenBalance",
      contractId,
      account: name,
      expected: formatUnits(raw, params.token.decimals),
      description: `${name} holds ${formatUnits(raw, params.token.decimals)} ${params.token.symbol}`,
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

/** Recover world parameters from an existing manifest (for modify/replay). */
export function deriveParams(manifest: WorldManifest): WorldParams {
  const contract = manifest.contracts[0];
  const token: TokenPreset = contract
    ? { name: contract.name, symbol: contract.symbol, decimals: contract.decimals }
    : { name: "Mock USDC", symbol: "USDC", decimals: 6 };

  const minted = new Map<string, bigint>();
  for (const action of manifest.actions) {
    if (action.type === "mint") {
      minted.set(
        action.to,
        (minted.get(action.to) ?? 0n) + parseUnits(action.amount, token.decimals),
      );
    }
  }
  const accounts = manifest.accounts
    .filter((a) => a.name !== DEPLOYER)
    .map((a) => ({
      name: a.name,
      initial: formatUnits(minted.get(a.name) ?? 0n, token.decimals),
    }));

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
