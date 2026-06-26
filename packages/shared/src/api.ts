import { z } from "zod";
import { Plan } from "./plan.js";
import { WorldManifest } from "./manifest.js";
import { AssertionResult, WorldState } from "./events.js";

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

// Generic error envelope
export const ApiError = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
