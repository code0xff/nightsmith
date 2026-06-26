import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, ensureDir } from "../utils/paths.js";

/**
 * Local, on-disk AI configuration. The user picks a provider and (for OpenAI)
 * supplies an API key via the cockpit's "Connect" flow; we persist it under
 * ~/.nightsmith/credentials.json with 0600 perms. The key is a provider
 * credential the user owns — it is never sent anywhere except OpenAI, never
 * logged, and never returned to the client.
 */
export type ProviderName = "mock" | "openai" | "codex";

interface StoredConfig {
  provider?: ProviderName;
  openaiApiKey?: string;
}

function credentialsPath(): string {
  return join(dataDir(), "credentials.json");
}

function read(): StoredConfig {
  const path = credentialsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

function write(config: StoredConfig): void {
  const dir = ensureDir(dataDir());
  // Keep the data dir and credentials file private even if they already exist
  // (mode on writeFileSync only applies when creating a new file).
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Best effort (e.g. on filesystems without POSIX perms).
  }
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort.
  }
}

function envProvider(): ProviderName | undefined {
  const e = process.env.NIGHTSMITH_AI_PROVIDER;
  return e === "mock" || e === "openai" || e === "codex" ? e : undefined;
}

/**
 * The active provider: env (NIGHTSMITH_AI_PROVIDER) wins, then the stored
 * choice, then mock. Env-first keeps config-as-code authoritative and matches
 * how the OpenAI key resolves (env over stored).
 */
export function resolveProvider(): ProviderName {
  return envProvider() ?? read().provider ?? "mock";
}

/** Whether the provider is pinned by the environment (UI can't override it). */
export function isProviderEnvManaged(): boolean {
  return envProvider() !== undefined;
}

/** Resolve the OpenAI key: env (12-factor) wins, else the stored key. */
export function resolveOpenAiKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? read().openaiApiKey;
}

export function isOpenAiConnected(): boolean {
  return Boolean(resolveOpenAiKey());
}

/** Persist a provider choice and/or OpenAI key. Empty key string clears it. */
export function setAiConfig(partial: {
  provider?: ProviderName;
  openaiApiKey?: string;
}): void {
  const current = read();
  const next: StoredConfig = { ...current };
  if (partial.provider !== undefined) next.provider = partial.provider;
  if (partial.openaiApiKey !== undefined) {
    if (partial.openaiApiKey === "") delete next.openaiApiKey;
    else next.openaiApiKey = partial.openaiApiKey;
  }
  write(next);
}

export function clearOpenAiKey(): void {
  const current = read();
  delete current.openaiApiKey;
  write(current);
}
