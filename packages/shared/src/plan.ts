import { z } from "zod";
import { WorldManifest } from "./manifest.js";

/**
 * A Plan is the AI planner's reviewable output. The planner produces plans; it
 * never executes. A plan is shown to the user as a preview and must be
 * confirmed before the executor runs it.
 */

export const PlanIntent = z.enum([
  /** Build a brand-new world from scratch. */
  "createWorld",
  /** Modify an existing world (e.g. change a balance) and re-run from scratch. */
  "modifyWorld",
  /**
   * Append new actions onto the already-running world without restarting Anvil.
   * The persisted manifest still grows as a full-from-genesis spec (so replay
   * stays deterministic); only the new action suffix is applied live.
   */
  "extendWorld",
  /** Re-run an existing scenario. */
  "runScenario",
  /** Control the localnet lifecycle (stop/reset/snapshot/revert/replay/resume). */
  "control",
  /** Explain a failure or inspect state — no mutation. */
  "explain",
]);
export type PlanIntent = z.infer<typeof PlanIntent>;

export const ControlAction = z.object({
  kind: z.enum([
    "start",
    "stop",
    "reset",
    "snapshot",
    "revert",
    "replay",
    "resume",
    "export",
  ]),
  note: z.string().optional(),
});
export type ControlAction = z.infer<typeof ControlAction>;

/** Drives the styling/header of the preview card. */
export const PlanPreview = z.object({
  title: z.string(),
  description: z.string(),
  accent: z.enum(["default", "warning", "destructive"]).default("default"),
});
export type PlanPreview = z.infer<typeof PlanPreview>;

export const Plan = z.object({
  intent: PlanIntent,
  /** One-paragraph human-readable summary of what will happen. */
  summary: z.string(),
  /** Assumptions the planner made (always present, may be empty). */
  assumptions: z.array(z.string()).default([]),
  /** Ordered, human-readable steps for the preview. */
  steps: z.array(z.string()).default([]),
  /** Human-readable expected state changes. */
  expectedStateChanges: z.array(z.string()).default([]),
  /** Human-readable assertion descriptions (executable ones live in the manifest). */
  assertions: z.array(z.string()).default([]),
  /** Safety notes surfaced to the user (local-only, mock tokens, etc.). */
  safetyNotes: z.array(z.string()).default([]),
  /** Full manifest for create/modify/run intents; null for control/explain. */
  manifest: WorldManifest.nullable().default(null),
  /** Control action for `control` intent; null otherwise. */
  control: ControlAction.nullable().default(null),
  /** Explanation text for `explain` intent; null otherwise. */
  explanation: z.string().nullable().default(null),
  uiPreview: PlanPreview,
});
export type Plan = z.infer<typeof Plan>;

export function parsePlan(input: unknown): Plan {
  return Plan.parse(input);
}
