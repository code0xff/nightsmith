import {
  PLANNER_JSON_CONTRACT,
  PLANNER_SYSTEM_PROMPT,
  summarizeArtifacts,
} from "../prompts/plannerPrompt.js";
import type { PlanInput } from "./types.js";

/** Shared prompt assembly for CLI-based providers (Codex, Claude). */
export function buildCliPrompt(input: PlanInput): string {
  const parts = [
    PLANNER_SYSTEM_PROMPT,
    PLANNER_JSON_CONTRACT,
    `User request: ${input.prompt}`,
    `Localnet running: ${input.running}`,
  ];
  if (input.previousManifest) {
    parts.push(`Previous manifest:\n${JSON.stringify(input.previousManifest)}`);
  }
  const artifacts = summarizeArtifacts(input.artifacts);
  if (artifacts) parts.push(artifacts);
  parts.push("Output ONLY the JSON object — no prose, no code fences, no tool calls.");
  return parts.join("\n\n");
}

/** Extract the outermost JSON object from a CLI's text output, tolerating stray prose/fences. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(slice);
}
