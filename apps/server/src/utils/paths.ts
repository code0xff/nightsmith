import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Root data directory for sessions, manifests, logs, and reports. */
export function dataDir(): string {
  return process.env.NIGHTSMITH_DATA_DIR ?? join(homedir(), ".nightsmith");
}

export function sessionsDir(): string {
  return join(dataDir(), "sessions");
}

export function sessionDir(id: string): string {
  return join(sessionsDir(), id);
}

/** PID/lock file for a running localnet, used by `nightsmith stop`. */
export function runtimeStateFile(): string {
  return join(dataDir(), "runtime.json");
}

/** Ensure a directory exists, returning it. */
export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Locate the built web UI (apps/web/dist) so the CLI can serve it. Works from
 * both the bundled dist and tsx-run src; returns null when no build exists
 * (e.g. dev mode, where Vite serves the UI instead).
 */
export function webDistDir(): string | null {
  if (process.env.NIGHTSMITH_WEB_DIST && existsSync(process.env.NIGHTSMITH_WEB_DIST)) {
    return process.env.NIGHTSMITH_WEB_DIST;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../web/dist"), // bundled: apps/server/dist -> apps/web/dist
    join(here, "../../../web/dist"), // src/utils -> apps/web/dist
    join(process.cwd(), "apps/web/dist"),
    // Published npm package layout (dist/ -> ../web-dist). Last, so a stale
    // packed web-dist can never shadow the live monorepo build in dev.
    join(here, "../web-dist"),
  ];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}
