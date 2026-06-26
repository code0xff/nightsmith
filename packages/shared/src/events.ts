import { z } from "zod";

/**
 * Real-time events streamed from the server to the cockpit over a single
 * WebSocket. Three kinds are multiplexed: structured logs, full world-state
 * snapshots, and execution-status transitions.
 */

export const LogLevel = z.enum(["debug", "info", "success", "warning", "error"]);
export type LogLevel = z.infer<typeof LogLevel>;

export const LogEntry = z.object({
  id: z.string(),
  ts: z.string(),
  level: LogLevel,
  message: z.string(),
  /** Optional scope tag, e.g. "anvil", "executor", "planner". */
  scope: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const LocalnetStatus = z.enum([
  "stopped",
  "starting",
  "running",
  "error",
]);
export type LocalnetStatus = z.infer<typeof LocalnetStatus>;

export const ExecutionStatus = z.enum([
  "idle",
  "planning",
  "awaiting-confirmation",
  "running",
  "completed",
  "failed",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

// ── World state snapshot ─────────────────────────────────────────────────────

export const LocalnetInfo = z.object({
  status: LocalnetStatus,
  chainId: z.number().optional(),
  rpcUrl: z.string().optional(),
  blockNumber: z.number().optional(),
  forked: z.boolean().default(false),
  sessionName: z.string().optional(),
});
export type LocalnetInfo = z.infer<typeof LocalnetInfo>;

export const AccountState = z.object({
  name: z.string(),
  address: z.string(),
  /** ETH balance in ether, as a decimal string. */
  ethBalance: z.string(),
  /**
   * The account's private key. For Nightsmith these are always Anvil's
   * well-known PUBLIC test keys (documented by Foundry, identical everywhere) —
   * shown so you can import the account into a wallet. Optional for
   * backward-compat with sessions saved before this field existed.
   */
  privateKey: z.string().optional(),
});
export type AccountState = z.infer<typeof AccountState>;

export const ContractState = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  address: z.string(),
});
export type ContractState = z.infer<typeof ContractState>;

export const TokenBalance = z.object({
  contractId: z.string(),
  symbol: z.string(),
  account: z.string(),
  /** Token balance in human units, as a decimal string. */
  balance: z.string(),
});
export type TokenBalance = z.infer<typeof TokenBalance>;

export const TxRecord = z.object({
  hash: z.string(),
  ts: z.string(),
  from: z.string(),
  to: z.string().optional(),
  fn: z.string().optional(),
  status: z.enum(["success", "reverted"]),
  gasUsed: z.string().optional(),
});
export type TxRecord = z.infer<typeof TxRecord>;

export const AssertionResult = z.object({
  description: z.string(),
  passed: z.boolean(),
  expected: z.string().optional(),
  actual: z.string().optional(),
});
export type AssertionResult = z.infer<typeof AssertionResult>;

export const ScenarioState = z.object({
  name: z.string(),
  status: z.enum(["idle", "running", "passed", "failed"]),
  assertions: z.array(AssertionResult).default([]),
});
export type ScenarioState = z.infer<typeof ScenarioState>;

export const WorldState = z.object({
  localnet: LocalnetInfo,
  execution: ExecutionStatus,
  accounts: z.array(AccountState).default([]),
  contracts: z.array(ContractState).default([]),
  tokenBalances: z.array(TokenBalance).default([]),
  transactions: z.array(TxRecord).default([]),
  scenario: ScenarioState.nullable().default(null),
});
export type WorldState = z.infer<typeof WorldState>;

export function emptyWorldState(): WorldState {
  return {
    localnet: { status: "stopped", forked: false },
    execution: "idle",
    accounts: [],
    contracts: [],
    tokenBalances: [],
    transactions: [],
    scenario: null,
  };
}

// ── Server → client events ───────────────────────────────────────────────────

export const LogEvent = z.object({ type: z.literal("log"), entry: LogEntry });
export const StateEvent = z.object({
  type: z.literal("state"),
  state: WorldState,
});
export const StatusEvent = z.object({
  type: z.literal("status"),
  status: ExecutionStatus,
  message: z.string().optional(),
});

export const ServerEvent = z.discriminatedUnion("type", [
  LogEvent,
  StateEvent,
  StatusEvent,
]);
export type ServerEvent = z.infer<typeof ServerEvent>;
