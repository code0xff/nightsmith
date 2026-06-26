import { z } from "zod";
import { Plan } from "./plan.js";
import { WorldManifest } from "./manifest.js";
import { AssertionResult, WorldState } from "./events.js";
import { HexString } from "./types.js";

/**
 * REST API request/response shapes. The cockpit issues commands over these;
 * live updates arrive separately over the WebSocket (`events.ts`).
 */

// POST /api/prompt — natural language -> reviewable plan
export const PromptRequest = z.object({
  prompt: z.string().min(1),
  /** Optional session to modify/extend. */
  sessionId: z.string().optional(),
});
export type PromptRequest = z.infer<typeof PromptRequest>;

export const PromptResponse = z.object({
  planId: z.string(),
  plan: Plan,
});
export type PromptResponse = z.infer<typeof PromptResponse>;

// POST /api/execute — confirm + run a plan
export const ExecuteRequest = z.object({
  plan: Plan,
  /** Echoed back for traceability; optional. */
  planId: z.string().optional(),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequest>;

export const StepResult = z.object({
  label: z.string(),
  status: z.enum(["ok", "failed", "skipped"]),
  detail: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResult>;

export const ExecutionReport = z.object({
  sessionId: z.string(),
  manifestName: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(["completed", "failed"]),
  steps: z.array(StepResult).default([]),
  assertions: z.array(AssertionResult).default([]),
  finalState: WorldState,
  error: z.string().optional(),
});
export type ExecutionReport = z.infer<typeof ExecutionReport>;

/**
 * Result of confirming a plan. Manifest-running intents return a session and
 * report; control intents (stop/reset/snapshot/…) return only the new state.
 */
export const ExecuteResponse = z.object({
  sessionId: z.string().nullable().default(null),
  report: ExecutionReport.nullable().default(null),
  state: WorldState,
});
export type ExecuteResponse = z.infer<typeof ExecuteResponse>;

// POST /api/localnet — direct lifecycle controls
export const LocalnetAction = z.enum([
  "start",
  "stop",
  "reset",
  "snapshot",
  "revert",
]);
export type LocalnetAction = z.infer<typeof LocalnetAction>;

export const LocalnetActionRequest = z.object({
  action: LocalnetAction,
  /** Snapshot id for `revert`. */
  snapshotId: z.string().optional(),
});
export type LocalnetActionRequest = z.infer<typeof LocalnetActionRequest>;

export const LocalnetActionResponse = z.object({
  ok: z.boolean(),
  state: WorldState,
  snapshotId: z.string().optional(),
});
export type LocalnetActionResponse = z.infer<typeof LocalnetActionResponse>;

// Sessions
export const SessionSummary = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRunStatus: z.enum(["completed", "failed", "none"]).default("none"),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export const SessionDetail = z.object({
  summary: SessionSummary,
  manifest: WorldManifest,
  report: ExecutionReport.nullable().default(null),
});
export type SessionDetail = z.infer<typeof SessionDetail>;

export const SessionListResponse = z.object({
  sessions: z.array(SessionSummary).default([]),
});
export type SessionListResponse = z.infer<typeof SessionListResponse>;

// AI provider configuration
export const ProviderName = z.enum(["mock", "openai", "codex"]);
export type ProviderName = z.infer<typeof ProviderName>;

export const AiStatus = z.object({
  /**
   * The provider that will actually run now, auto-resolved by availability:
   * OpenAI (if a key is set) → Codex (if the CLI is installed) → mock.
   */
  provider: ProviderName,
  /** Whether an OpenAI key is available (env or stored). Never the key itself. */
  openaiConnected: z.boolean(),
  /** Whether the Codex CLI is installed (usable as a no-key fallback). */
  codexAvailable: z.boolean(),
  model: z.string(),
  providers: z.array(ProviderName),
});
export type AiStatus = z.infer<typeof AiStatus>;

export const AiConnectRequest = z.object({
  /** OpenAI API key to store locally; "" clears it. Never returned by the API. */
  openaiApiKey: z.string().optional(),
});
export type AiConnectRequest = z.infer<typeof AiConnectRequest>;

// Anvil toolchain status / install
export const AnvilStatus = z.object({
  installed: z.boolean(),
  /** Whether automatic install is supported on this platform (macOS/Linux). */
  installable: z.boolean(),
  /** The exact command an install will run (shown to the user for consent). */
  installCommand: z.string(),
  /**
   * Per-process token required (as `x-nightsmith-install-token`) to POST the
   * install. Only a same-origin reader (the cockpit) can obtain it, so a
   * cross-origin page can't trigger the install.
   */
  installToken: z.string(),
});
export type AnvilStatus = z.infer<typeof AnvilStatus>;

// Uploaded contract artifacts (custom contracts)
export const UploadedArtifact = z.object({
  name: z.string().min(1).max(64),
  abi: z.array(z.record(z.string(), z.unknown())).min(1),
  bytecode: HexString,
});
export type UploadedArtifact = z.infer<typeof UploadedArtifact>;

export const ArtifactSummary = z.object({
  name: z.string(),
  functions: z.array(z.string()).default([]),
});
export type ArtifactSummary = z.infer<typeof ArtifactSummary>;

export const ArtifactListResponse = z.object({
  artifacts: z.array(ArtifactSummary).default([]),
});
export type ArtifactListResponse = z.infer<typeof ArtifactListResponse>;

// Generic error envelope
export const ApiError = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
