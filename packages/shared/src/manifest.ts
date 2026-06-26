import { z } from "zod";
import { AccountName, AccountRef, DecimalAmount, Identifier } from "./types.js";

/**
 * The World manifest is Nightsmith's internal source of truth. It fully and
 * deterministically describes a local blockchain world: the network, the
 * named accounts, the contracts, the ordered actions, and the assertions.
 *
 * Execution order is fixed and deterministic:
 *   1. start the network (from `network`)
 *   2. resolve + fund accounts (from `accounts`)
 *   3. run `actions` in order
 *   4. evaluate `assertions` in order
 */

export const MANIFEST_VERSION = 1 as const;

export const NetworkConfig = z.object({
  kind: z.literal("anvil-local"),
  /** EVM chain id. Anvil default is 31337. */
  chainId: z.number().int().positive().default(31337),
  /** TCP port Anvil binds to. */
  port: z.number().int().min(1).max(65535).default(8545),
  /** Optional deterministic mnemonic. When omitted, Anvil's default is used. */
  mnemonic: z.string().optional(),
  /** Fork source URL. `null` means a fresh local chain (the safe default). */
  forkUrl: z.string().url().nullable().default(null),
  /** Whether broadcasting beyond the local node is permitted. Always false by default. */
  broadcast: z.boolean().default(false),
});
export type NetworkConfig = z.infer<typeof NetworkConfig>;

export const AccountDef = z.object({
  /** Human name, e.g. "deployer", "Alice", "Bob". */
  name: AccountName,
  /** Index into Anvil's deterministic dev accounts (0-9). These are public test keys. */
  addressIndex: z.number().int().min(0).max(9),
  /** Local ETH to ensure the account holds, as a decimal ether string. */
  fundEth: DecimalAmount.default("0"),
});
export type AccountDef = z.infer<typeof AccountDef>;

export const MockErc20Def = z.object({
  id: Identifier,
  kind: z.literal("MockERC20"),
  name: z.string().min(1),
  symbol: z.string().min(1).max(16),
  decimals: z.number().int().min(0).max(36),
});
export type MockErc20Def = z.infer<typeof MockErc20Def>;

/** Contract definitions. Extensible via discriminated union on `kind`. */
export const ContractDef = z.discriminatedUnion("kind", [MockErc20Def]);
export type ContractDef = z.infer<typeof ContractDef>;

// ── Actions ──────────────────────────────────────────────────────────────

export const DeployContractAction = z.object({
  type: z.literal("deployContract"),
  /** Refers to a ContractDef.id. */
  contractId: Identifier,
  /** Account name that deploys (and owns) the contract. */
  deployer: AccountName,
});

export const MintAction = z.object({
  type: z.literal("mint"),
  contractId: Identifier,
  /** Recipient: a named account or a literal 0x address. */
  to: AccountRef,
  amount: DecimalAmount,
});

export const TransferAction = z.object({
  type: z.literal("transfer"),
  contractId: Identifier,
  /** Sender must be a named Anvil account (Nightsmith can only sign for those). */
  from: AccountName,
  /** Recipient: a named account or a literal 0x address. */
  to: AccountRef,
  amount: DecimalAmount,
});

export const Action = z.discriminatedUnion("type", [
  DeployContractAction,
  MintAction,
  TransferAction,
]);
export type Action = z.infer<typeof Action>;
export type ActionType = Action["type"];

// ── Assertions ─────────────────────────────────────────────────────────────

export const TokenBalanceAssertion = z.object({
  type: z.literal("tokenBalance"),
  contractId: Identifier,
  /** A named account or a literal 0x address. */
  account: AccountRef,
  /** Expected balance in human units (decimals applied by the executor). */
  expected: DecimalAmount,
  /** Optional human-readable description for the UI. */
  description: z.string().optional(),
});

export const Assertion = z.discriminatedUnion("type", [TokenBalanceAssertion]);
export type Assertion = z.infer<typeof Assertion>;

// ── World ───────────────────────────────────────────────────────────────────

export const WorldManifest = z.object({
  version: z.literal(MANIFEST_VERSION).default(MANIFEST_VERSION),
  name: z.string().min(1),
  description: z.string().optional(),
  /** ISO timestamp set by the generator. Not used for deterministic execution. */
  createdAt: z.string(),
  network: NetworkConfig,
  accounts: z.array(AccountDef).default([]),
  contracts: z.array(ContractDef).default([]),
  actions: z.array(Action).default([]),
  assertions: z.array(Assertion).default([]),
});
export type WorldManifest = z.infer<typeof WorldManifest>;

/** Parse + apply defaults, throwing a ZodError on invalid input. */
export function parseManifest(input: unknown): WorldManifest {
  return WorldManifest.parse(input);
}
