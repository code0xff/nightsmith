import { execa } from "execa";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Plan as PlanSchema, type Plan } from "@nightsmith/shared";
import { AppError } from "../../utils/errors.js";
import { buildCliPrompt, extractJsonObject } from "./cliShared.js";
import type { AiProvider, PlanInput } from "./types.js";

const CLAUDE_TIMEOUT_MS = 120_000;
const AVAILABILITY_TTL_MS = 30_000;
let availableCache: { value: boolean; checkedAt: number } | null = null;

interface ClaudePrintResult {
  is_error?: boolean;
  result?: string;
}

/** `--output-format json` should always emit one JSON envelope; tolerate otherwise. */
function tryParseEnvelope(stdout: string): ClaudePrintResult | null {
  try {
    return JSON.parse(stdout) as ClaudePrintResult;
  } catch {
    return null;
  }
}

/**
 * Whether the Claude Code CLI is installed. Cached with a short TTL so
 * installing it after the server starts is picked up without a restart. This
 * only tells us the binary exists, not that the user is logged in (a
 * login/runtime failure surfaces when we actually invoke it, and the planner
 * falls back).
 */
export async function isClaudeAvailable(signal?: AbortSignal): Promise<boolean> {
  if (availableCache && Date.now() - availableCache.checkedAt < AVAILABILITY_TTL_MS) {
    return availableCache.value;
  }
  let value = false;
  try {
    await execa("claude", ["--version"], { timeout: 5000, cancelSignal: signal });
    value = true;
  } catch (err) {
    // A cancel here isn't "claude is unavailable" — propagate it and leave the
    // cache untouched instead of poisoning it with a spurious false for 30s.
    if (signal?.aborted) throw err;
    value = false;
  }
  availableCache = { value, checkedAt: Date.now() };
  return value;
}

/**
 * Plan via the locally installed Claude Code CLI (non-interactive). Reuses
 * the user's existing Claude Code login — no API key needed. Runs in a
 * throwaway working dir outside the repo (so it never picks up this
 * project's own CLAUDE.md) with all built-in tools and MCP servers disabled,
 * so it behaves as a pure text generator — it must only ever plan, never
 * execute (see `AiProvider`).
 */
export const claudeProvider: AiProvider = {
  name: "claude",
  async generate(input: PlanInput, signal?: AbortSignal): Promise<Plan> {
    if (!(await isClaudeAvailable(signal))) {
      throw new AppError("Claude Code CLI not found on PATH", 400);
    }

    const work = mkdtempSync(join(tmpdir(), "nightsmith-claude-"));
    try {
      const model = process.env.NIGHTSMITH_CLAUDE_MODEL;
      const { stdout } = await execa(
        "claude",
        [
          "-p",
          "--output-format",
          "json",
          "--tools",
          "",
          "--strict-mcp-config",
          "--safe-mode",
          "--no-session-persistence",
          ...(model ? ["--model", model] : []),
          buildCliPrompt(input),
        ],
        {
          cwd: work,
          timeout: CLAUDE_TIMEOUT_MS,
          cancelSignal: signal, // kill the subprocess if planning is cancelled
          // Don't leak the server's full environment (other API keys, RPC
          // URLs, etc.) into the subprocess — Claude Code's default system
          // prompt includes an "env info" section built from its environment.
          // Only what's needed to locate the binary and read its stored login
          // is passed through: PATH/HOME, plus USER/LOGNAME (macOS Keychain
          // resolves the login keychain by user identity — without these the
          // CLI reports "Not logged in" even with a valid keychain entry,
          // confirmed empirically). An explicit Anthropic key is included too,
          // if that's how this install authenticates.
          extendEnv: false,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            USER: process.env.USER,
            LOGNAME: process.env.LOGNAME,
            ...(process.env.ANTHROPIC_API_KEY
              ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
              : {}),
          },
        },
      );

      // `--output-format json` wraps the reply in an envelope with the final
      // text in `.result`; fall back to raw stdout if it isn't one (e.g. an
      // unexpected CLI output shape).
      const envelope = tryParseEnvelope(stdout);
      if (envelope?.is_error) {
        throw new AppError(`Claude CLI returned an error: ${envelope.result ?? "unknown"}`, 502);
      }
      const resultText = typeof envelope?.result === "string" ? envelope.result : stdout;
      return PlanSchema.parse(extractJsonObject(resultText));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
};
