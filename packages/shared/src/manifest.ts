import { z } from "zod";
import {
  AccountName,
  AccountRef,
  DecimalAmount,
  EtherAmount,
  HexString,
  Identifier,
} from "./types.js";

/**
 * A contract argument value (constructor or function call). JSON-friendly:
 * integers are passed as decimal strings, addresses/bytes as 0x strings, plus
 * bool and arrays. Tuples/structs are out of scope for now.
 */
export type ArgValue = string | number | boolean | ArgValue[];
export const ArgValue: z.ZodType<ArgValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(ArgValue)]),
);

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
  fundEth: EtherAmount.default("0"),
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

/**
 * A user-supplied compiled contract, deployed verbatim (no runtime solc). The
 * ABI + bytecode are inlined so the manifest stays self-contained and
 * replayable. ABI is validated loosely; viem parses it.
 */
export const ArtifactContractDef = z.object({
  id: Identifier,
  kind: z.literal("artifact"),
  /** Must match an uploaded artifact's name; the server fills abi+bytecode. */
  name: z.string().min(1),
  /** abi/bytecode may be empty in a freshly planned manifest; the server
   *  "hydrates" them from the uploaded artifact, and execution requires them. */
  abi: z.array(z.record(z.string(), z.unknown())).default([]),
  bytecode: HexString.default("0x"),
});
export type ArtifactContractDef = z.infer<typeof ArtifactContractDef>;

/** Contract definitions. Extensible via discriminated union on `kind`. */
export const ContractDef = z.discriminatedUnion("kind", [
  MockErc20Def,
  ArtifactContractDef,
]);
export type ContractDef = z.infer<typeof ContractDef>;

// ── Actions ──────────────────────────────────────────────────────────────

export const DeployContractAction = z.object({
  type: z.literal("deployContract"),
  /** Refers to a ContractDef.id. */
  contractId: Identifier,
  /** Account name that deploys (and owns) the contract. */
  deployer: AccountName,
  /** Constructor arguments (encoded against the contract's ABI). */
  args: z.array(ArgValue).default([]),
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
  /** Sender: a named account (signed) or a literal 0x address (impersonated). */
  from: AccountRef,
  /** Recipient: a named account or a literal 0x address. */
  to: AccountRef,
  amount: DecimalAmount,
});

/**
 * A token amount for approvals/allowances: a human decimal string, or the
 * literal "max" for an unlimited (uint256-max) approval. Kept separate from
 * DecimalAmount so mint/transfer amounts stay strictly numeric.
 */
export const TokenAmountOrMax = z.union([DecimalAmount, z.literal("max")]);
export type TokenAmountOrMax = z.infer<typeof TokenAmountOrMax>;

/** Grant an ERC20 allowance: owner approves spender to move `amount` tokens. */
export const ApproveAction = z.object({
  type: z.literal("approve"),
  contractId: Identifier,
  /** Token owner: a named account (signed) or a literal 0x address (impersonated). */
  owner: AccountRef,
  /** Spender being approved: a named account or a literal 0x address. */
  spender: AccountRef,
  /** Allowance in human units, or "max" for an unlimited approval. */
  amount: TokenAmountOrMax,
});

/** Call any function on a deployed contract (init/setup, state changes). */
export const CallAction = z.object({
  type: z.literal("call"),
  contractId: Identifier,
  /** Function name in the contract's ABI. */
  function: z.string().min(1),
  args: z.array(ArgValue).default([]),
  /** Signer: a named account (signed) or a literal 0x address (impersonated). */
  from: AccountRef,
  /** Optional ETH value to send with the call (ether, decimal string). */
  value: EtherAmount.optional(),
});
export type CallAction = z.infer<typeof CallAction>;

/**
 * Advance the chain: optionally jump the block timestamp forward by
 * `secondsDelta`, then mine `blocks` block(s). Enables time-dependent tests
 * (vesting, timelocks, cooldowns). References no contract.
 */
export const MineAction = z.object({
  type: z.literal("mine"),
  /** Number of blocks to mine (default 1). Capped so a plan can't ask Anvil to
   *  produce a huge number of blocks and tie up the localnet. */
  blocks: z.number().int().min(1).max(10_000).default(1),
  /** Seconds to advance the block timestamp before mining (default 0). */
  secondsDelta: z.number().int().min(0).default(0),
});
export type MineAction = z.infer<typeof MineAction>;

export const Action = z.discriminatedUnion("type", [
  DeployContractAction,
  MintAction,
  TransferAction,
  ApproveAction,
  MineAction,
  CallAction,
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

/** Assert the (normalized) return value of a view/pure function call. */
export const CallResultAssertion = z.object({
  type: z.literal("callResult"),
  contractId: Identifier,
  function: z.string().min(1),
  args: z.array(ArgValue).default([]),
  /** Expected result, compared as a normalized string (bigint→decimal, address→lowercase). */
  expected: z.string(),
  description: z.string().optional(),
});

/** Assert an ERC20 allowance: how much `spender` may move on `owner`'s behalf. */
export const AllowanceAssertion = z.object({
  type: z.literal("allowance"),
  contractId: Identifier,
  /** Token owner: a named account or a literal 0x address. */
  owner: AccountRef,
  /** Spender: a named account or a literal 0x address. */
  spender: AccountRef,
  /** Expected allowance in human units, or "max" for an unlimited approval. */
  expected: TokenAmountOrMax,
  description: z.string().optional(),
});

/** Assert an account's native ETH balance (exact, in ether). References no
 *  contract. Note: gas spent by a sender is deterministic but real, so assert
 *  on accounts that only receive (or account for gas). */
export const EthBalanceAssertion = z.object({
  type: z.literal("ethBalance"),
  /** A named account or a literal 0x address. */
  account: AccountRef,
  /** Expected native balance in ether (decimal string). */
  expected: EtherAmount,
  description: z.string().optional(),
});

/**
 * Assert a contract emitted an event during execution. `args` optionally filters
 * by named event arg (indexed or not); `count` asserts an exact number of
 * matching emissions (default: at least one).
 */
export const EventAssertion = z.object({
  type: z.literal("event"),
  contractId: Identifier,
  /** Event name in the contract's ABI. */
  event: z.string().min(1),
  /** Optional expected values for named event args (a named account resolves to
   *  its address for address-typed args). */
  args: z.record(z.string(), ArgValue).default({}),
  /** Exact number of matching emissions; omit to assert at least one. */
  count: z.number().int().min(0).optional(),
  description: z.string().optional(),
});

export const Assertion = z.discriminatedUnion("type", [
  TokenBalanceAssertion,
  CallResultAssertion,
  AllowanceAssertion,
  EthBalanceAssertion,
  EventAssertion,
]);
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
