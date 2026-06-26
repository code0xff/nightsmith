import { Plan as PlanSchema, type Plan } from "@blacksmith/shared";
import { errorMessage } from "../utils/errors.js";
import { scanForSecrets } from "../safety/validateSecrets.js";
import { resolveOpenAiKey, resolveProvider, type ProviderName } from "./credentials.js";
import { codexProvider, isCodexAvailable } from "./providers/codex.js";
import { mockProvider } from "./providers/mock.js";
import { openaiProvider } from "./providers/openai.js";
import type { AiProvider, PlanInput } from "./providers/types.js";

const PROVIDERS: Record<ProviderName, AiProvider> = {
  mock: mockProvider,
  openai: openaiProvider,
  codex: codexProvider,
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

export type PlanLogger = (level: "info" | "warning", message: string) => void;

/**
 * Strip anything secret-bearing from the context handed to an external
 * provider. Manifests never *should* carry a mnemonic/credential fork URL, but
 * a hand-edited session on disk could — so we drop them defensively and
 * secret-scan the serialized context, omitting it entirely if anything slips
 * through.
 */
function sanitizeForProvider(input: PlanInput): PlanInput {
  if (!input.previousManifest) return input;
  const m = input.previousManifest;
  const cleaned = {
    ...m,
    network: { ...m.network, mnemonic: undefined, forkUrl: null },
  };
  if (scanForSecrets(JSON.stringify(cleaned)).length > 0) {
    return { ...input, previousManifest: null };
  }
  return { ...input, previousManifest: cleaned };
}

/**
 * Ordered providers to attempt for the active choice, filtered by availability.
 * A no-key OpenAI choice falls back to Codex (if installed), and everything
 * ultimately falls back to the always-available mock planner.
 */
async function providerChain(): Promise<AiProvider[]> {
  const choice = resolveProvider();
  const hasKey = Boolean(resolveOpenAiKey());
  const codexOk = await isCodexAvailable();

  const order: AiProvider[] = [];
  const add = (p: AiProvider) => {
    if (!order.includes(p)) order.push(p);
  };

  if (choice === "openai") {
    if (hasKey) add(openaiProvider);
    if (codexOk) add(codexProvider);
  } else if (choice === "codex") {
    if (codexOk) add(codexProvider);
    if (hasKey) add(openaiProvider);
  }
  // mock is always available and is the final fallback.
  add(mockProvider);
  return order;
}

/**
 * Generate a plan, trying providers in fallback order and validating each
 * against the Plan schema. `log` surfaces fallbacks to the UI so a degraded
 * provider isn't silent.
 */
export async function generatePlan(
  input: PlanInput,
  log?: PlanLogger,
): Promise<{ plan: Plan; provider: string }> {
  const chain = await providerChain();
  const safeInput = sanitizeForProvider(input);
  let lastError: unknown;

  for (const provider of chain) {
    try {
      const plan = PlanSchema.parse(await provider.generate(safeInput));
      return { plan, provider: provider.name };
    } catch (err) {
      lastError = err;
      log?.("warning", `Provider "${provider.name}" failed: ${errorMessage(err)}`);
    }
  }
  // Unreachable in practice (mock never throws), but keep the error honest.
  throw lastError ?? new Error("No AI provider produced a plan");
}
