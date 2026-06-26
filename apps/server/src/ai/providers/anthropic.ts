import type { Plan } from "@blacksmith/shared";
import { AppError } from "../../utils/errors.js";
import { PLANNER_SYSTEM_PROMPT } from "../prompts/plannerPrompt.js";
import type { AiProvider, PlanInput } from "./types.js";

/**
 * Stub Anthropic provider. The MVP ships the deterministic mock provider; this
 * documents the integration shape. A real implementation would send
 * PLANNER_SYSTEM_PROMPT + the user prompt (never secrets) and parse the JSON
 * response with the Plan schema before returning.
 */
export const anthropicProvider: AiProvider = {
  name: "anthropic",
  async generate(_input: PlanInput): Promise<Plan> {
    void PLANNER_SYSTEM_PROMPT;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AppError("ANTHROPIC_API_KEY is not set", 400);
    }
    throw new AppError(
      "The Anthropic provider is not implemented in the MVP. Use BLACKSMITH_AI_PROVIDER=mock.",
      501,
    );
  },
};
