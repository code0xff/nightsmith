import { Plan as PlanSchema, type Plan } from "@blacksmith/shared";
import { AppError } from "../utils/errors.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { mockProvider } from "./providers/mock.js";
import { openaiProvider } from "./providers/openai.js";
import type { AiProvider, PlanInput } from "./providers/types.js";

const PROVIDERS: Record<string, AiProvider> = {
  mock: mockProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

/** Select the configured provider (default: deterministic mock). */
export function selectProvider(): AiProvider {
  const name = process.env.BLACKSMITH_AI_PROVIDER ?? "mock";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new AppError(
      `Unknown AI provider "${name}". Available: ${Object.keys(PROVIDERS).join(", ")}`,
      400,
    );
  }
  return provider;
}

/**
 * Generate a plan from natural language and validate it against the Plan
 * schema. The planner only produces plans — execution happens separately,
 * after safety validation and user confirmation.
 */
export async function generatePlan(input: PlanInput): Promise<{ plan: Plan; provider: string }> {
  const provider = selectProvider();
  const raw = await provider.generate(input);
  const plan = PlanSchema.parse(raw);
  return { plan, provider: provider.name };
}
