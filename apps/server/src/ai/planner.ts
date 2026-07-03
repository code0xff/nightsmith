import { Plan as PlanSchema, type Plan, type ProviderName } from "@nightsmith/shared";
import { errorMessage } from "../utils/errors.js";
import { scanForSecrets } from "../safety/validateSecrets.js";
import { isOpenAiConnected } from "./credentials.js";
import { claudeProvider, isClaudeAvailable } from "./providers/claude.js";
import { codexProvider, isCodexAvailable } from "./providers/codex.js";
import { mockProvider } from "./providers/mock.js";
import { openaiProvider } from "./providers/openai.js";
import type { AiProvider, PlanInput } from "./providers/types.js";

export const PROVIDER_NAMES: ProviderName[] = ["mock", "openai", "codex", "claude"];

export type PlanLogger = (level: "info" | "warning", message: string) => void;

/**
 * Providers to try, in order, resolved purely by availability:
 *   OpenAI (if a key is set) → Codex (if the CLI is installed) → Claude Code
 *   CLI (if installed) → mock (always).
 * No manual selection — the first available wins, and the rest are fallbacks.
 */
async function providerChain(signal?: AbortSignal): Promise<AiProvider[]> {
  const chain: AiProvider[] = [];
  if (isOpenAiConnected()) chain.push(openaiProvider);
  // Pass the signal so a Stop during the CLI `--version` probes cancels them
  // instead of blocking behind their timeouts.
  if (await isCodexAvailable(signal)) chain.push(codexProvider);
  if (await isClaudeAvailable(signal)) chain.push(claudeProvider);
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
  signal?: AbortSignal,
): Promise<{ plan: Plan; provider: string }> {
  // Explicit abort checks around every await — a cancel must stop before the
  // availability probes, before any provider call, and (critically) before the
  // always-available Mock, which ignores the signal and would otherwise return
  // a plan the user cancelled.
  signal?.throwIfAborted();
  const chain = await providerChain(signal);
  signal?.throwIfAborted();
  const safeInput = sanitizeForProvider(input);
  let lastError: unknown;

  for (const provider of chain) {
    signal?.throwIfAborted();
    try {
      const plan = PlanSchema.parse(await provider.generate(safeInput, signal));
      return { plan, provider: provider.name };
    } catch (err) {
      // A cancel must stop the whole chain — never fall through to another
      // provider (or the Mock) and silently produce a plan the user aborted.
      if (signal?.aborted) throw err;
      lastError = err;
      log?.("warning", `Provider "${provider.name}" failed: ${errorMessage(err)}`);
    }
  }
  throw lastError ?? new Error("No AI provider produced a plan");
}
