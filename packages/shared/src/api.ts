import { z } from "zod";
import { Plan } from "./plan.js";
import { WorldManifest } from "./manifest.js";
import { AssertionResult, WorldState } from "./events.js";
import { HexString } from "./types.js";

/**
 * REST API request/response shapes. The cockpit issues commands over these;
 * live updates arrive separately over the WebSocket (`events.ts`).
 */

/** Upper bound on a prompt, enforced at both planning and execution. */
export const MAX_PROMPT_LENGTH = 10_000;

// POST /api/prompt — natural language -> reviewable plan
export const PromptRequest = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_LENGTH),
  /** Optional session to modify/extend. */
  sessionId: z.string().optional(),
});
export type PromptRequest = z.infer<typeof PromptRequest>;

export const PromptResponse = z.object({
  planId: z.string(),
  plan: Plan,
  /**
   * Server-computed, non-blocking pre-execution warnings (ABI-conformance
   * checks on the plan's manifest). Advisory only — the user may still run.
   */
  warnings: z.array(z.string()).default([]),
});
export type PromptResponse = z.infer<typeof PromptResponse>;

// POST /api/execute — confirm + run a plan
export const ExecuteRequest = z.object({
  plan: Plan,
  /** Echoed back for traceability; optional. */
  planId: z.string().optional(),
  /**
   * The session whose live world an `extendWorld` plan should append to. The
   * server also tracks the live session internally; this lets the client be
   * explicit about which world it means. Ignored for non-extend intents.
   */
  baseSessionId: z.string().optional(),
  /** The natural-language prompt that produced this plan; persisted with the session. */
  prompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
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
 * report; control intents (stop/…) return only the new state.
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
  // Wipe the (stopped) world display + logs back to a blank cockpit.
  "clear",
]);
export type LocalnetAction = z.infer<typeof LocalnetAction>;

export const LocalnetActionRequest = z.object({
  action: LocalnetAction,
});
export type LocalnetActionRequest = z.infer<typeof LocalnetActionRequest>;

export const LocalnetActionResponse = z.object({
  ok: z.boolean(),
  state: WorldState,
});
export type LocalnetActionResponse = z.infer<typeof LocalnetActionResponse>;

// POST /api/import — load a raw (exported) manifest and replay it as a new
// session. The manifest is re-validated server-side (shape + network safety)
// before it runs; the response is the same shape as a normal execution.
export const ImportManifestRequest = z.object({
  manifest: WorldManifest,
});
export type ImportManifestRequest = z.infer<typeof ImportManifestRequest>;

// Sessions
export const SessionSummary = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRunStatus: z.enum(["completed", "failed", "none"]).default("none"),
  /** The natural-language prompt that originally created this session, if any. */
  prompt: z.string().optional(),
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
export const ProviderName = z.enum(["mock", "openai", "codex", "claude"]);
export type ProviderName = z.infer<typeof ProviderName>;

export const AiStatus = z.object({
  /**
   * The provider that will actually run now, auto-resolved by availability:
   * OpenAI (if a key is set) → Codex (if the CLI is installed) → Claude Code
   * CLI (if installed) → mock.
   */
  provider: ProviderName,
  /** Whether an OpenAI key is available (env or stored). Never the key itself. */
  openaiConnected: z.boolean(),
  /** Whether the Codex CLI is installed (usable as a no-key fallback). */
  codexAvailable: z.boolean(),
  /** Whether the Claude Code CLI is installed (usable as a no-key fallback). */
  claudeAvailable: z.boolean(),
  model: z.string(),
  providers: z.array(ProviderName),
});
export type AiStatus = z.infer<typeof AiStatus>;

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
  /** Creation bytecode — must be non-empty (not just "0x" / runtime bytecode). */
  bytecode: HexString.refine((b) => b.length > 2, {
    message: "creation bytecode must not be empty",
  }),
  /**
   * NatSpec docs, when the artifact was compiled from source (raw forge
   * `userdoc`/`devdoc`). The planner uses these as a compact, high-signal
   * excerpt of the source. Absent for precompiled-JSON uploads.
   */
  natspec: z
    .object({
      userdoc: z.record(z.string(), z.unknown()).optional(),
      devdoc: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  /** Full Solidity source of the compiled contract's file (excerpted for the planner). */
  source: z.string().optional(),
});
export type UploadedArtifact = z.infer<typeof UploadedArtifact>;

/**
 * Request to compile a Solidity contract at runtime and store it as an
 * artifact. Exactly one input must be provided: inline `source`, a local
 * `path` (a `.sol` file or a dir inside a Foundry project), or a base64 `zip`
 * of a project. `contractName` selects one contract when a file/project has
 * several; `name` overrides the stored artifact name (defaults to the contract).
 */
export const CompileArtifactRequest = z
  .object({
    name: z.string().min(1).max(64).optional(),
    contractName: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    /** Optional project root override for `path` mode. */
    root: z.string().min(1).optional(),
    /** Base64-encoded zip archive of a project (for the web multi-file path). */
    zipBase64: z.string().min(1).optional(),
  })
  .refine((v) => [v.source, v.path, v.zipBase64].filter(Boolean).length === 1, {
    message: "provide exactly one of: source, path, zipBase64",
  });
export type CompileArtifactRequest = z.infer<typeof CompileArtifactRequest>;

export const ArtifactSummary = z.object({
  name: z.string(),
  functions: z.array(z.string()).default([]),
  /** Built-in default contract (e.g. MockERC20) — always present, undeletable. */
  builtin: z.boolean().default(false),
});
export type ArtifactSummary = z.infer<typeof ArtifactSummary>;

export const ArtifactListResponse = z.object({
  artifacts: z.array(ArtifactSummary).default([]),
});
export type ArtifactListResponse = z.infer<typeof ArtifactListResponse>;

/**
 * Result of inspecting a compile input (POST /api/artifacts/inspect): every
 * deployable contract found in ONE build, returned as full unsaved artifacts.
 * The client registers a chosen subset via the normal POST /api/artifacts.
 */
export const InspectArtifactsResponse = z.object({
  contracts: z
    .array(
      z.object({
        artifact: UploadedArtifact,
        /** `<File>.sol` the contract came from (disambiguates same names). */
        sourceFile: z.string(),
      }),
    )
    .default([]),
});
export type InspectArtifactsResponse = z.infer<typeof InspectArtifactsResponse>;

// Generic error envelope
export const ApiError = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
