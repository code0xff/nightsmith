import { Plan as PlanSchema, type Plan, type ProviderName } from "@nightsmith/shared";
import { errorMessage } from "../utils/errors.js";
import { scanForSecrets } from "../safety/validateSecrets.js";
import { isOpenAiConnected } from "./credentials.js";
import { codexProvider, isCodexAvailable } from "./providers/codex.js";
import { mockProvider } from "./providers/mock.js";
import { openaiProvider } from "./providers/openai.js";
import type { AiProvider, PlanInput } from "./providers/types.js";

export const PROVIDER_NAMES: ProviderName[] = ["mock", "openai", "codex"];

export type PlanLogger = (level: "info" | "warning", message: string) => void;

/**
 * Providers to try, in order, resolved purely by availability:
 *   OpenAI (if a key is set) → Codex (if the CLI is installed) → mock (always).
 * No manual selection — the first available wins, and the rest are fallbacks.
 */
async function providerChain(): Promise<AiProvider[]> {
  const chain: AiProvider[] = [];
  if (isOpenAiConnected()) chain.push(openaiProvider);
  if (await isCodexAvailable()) chain.push(codexProvider);
  chain.push(mockProvider); // always available
  return chain;
}

/** The provider that will actually run right now (the chain head). */
export async function activeProvider(): Promise<ProviderName> {
  return (await providerChain())[0]!.name as ProviderName;
}

/**
 * Strip anything secret-bearing from the context handed to an external
 * provider (defensive — manifests shouldn't carry a mnemonic/credential fork
 * URL, but a hand-edited session could).
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
 * Generate a plan, trying providers in availability order and validating each
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
  throw lastError ?? new Error("No AI provider produced a plan");
}
