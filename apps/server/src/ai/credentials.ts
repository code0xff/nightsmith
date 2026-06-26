import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, ensureDir } from "../utils/paths.js";

/**
 * Local, on-disk AI configuration — just the OpenAI API key. Provider selection
 * is automatic (by availability), so there is nothing else to store. The key is
 * the user's own credential: kept at ~/.nightsmith/credentials.json with 0600
 * perms, never logged, never returned to the client, and sent only to OpenAI.
 */
interface StoredConfig {
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
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Best effort (filesystems without POSIX perms).
  }
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort.
  }
}

/** Resolve the OpenAI key: env (12-factor) wins, else stored. Empty → none. */
export function resolveOpenAiKey(): string | undefined {
  const key = (process.env.OPENAI_API_KEY ?? read().openaiApiKey)?.trim();
  return key ? key : undefined;
}

export function isOpenAiConnected(): boolean {
  return resolveOpenAiKey() !== undefined;
}

/** Store the OpenAI key locally (an empty string clears it). */
export function setOpenAiKey(key: string): void {
  const current = read();
  if (key.trim() === "") delete current.openaiApiKey;
  else current.openaiApiKey = key.trim();
  write(current);
}

export function clearOpenAiKey(): void {
  const current = read();
  delete current.openaiApiKey;
  write(current);
}
