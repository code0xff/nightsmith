import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Root data directory for sessions, manifests, logs, and reports. */
export function dataDir(): string {
  return process.env.BLACKSMITH_DATA_DIR ?? join(homedir(), ".blacksmith");
}

export function sessionsDir(): string {
  return join(dataDir(), "sessions");
}

export function sessionDir(id: string): string {
  return join(sessionsDir(), id);
}

/** PID/lock file for a running localnet, used by `blacksmith stop`. */
export function runtimeStateFile(): string {
  return join(dataDir(), "runtime.json");
}

/** Ensure a directory exists, returning it. */
export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
