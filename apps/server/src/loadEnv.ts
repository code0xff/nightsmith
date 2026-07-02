import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Files that mark the workspace root — stop the upward `.env` search here. */
const ROOT_MARKERS = ["pnpm-workspace.yaml", ".git"];

/**
 * Locate the `.env` to load. `NIGHTSMITH_ENV_FILE` wins if set. Otherwise walk
 * UP from the current directory and return the nearest `.env`, stopping at the
 * workspace root so we never read a stray `.env` outside the repo. This makes
 * the loader independent of the launch directory — the monorepo's single root
 * `.env` is found whether you run from the repo root or from `apps/server`
 * (e.g. via `pnpm --filter`), which cwd-relative loading got wrong.
 */
function findEnvFile(): string | undefined {
  if (process.env.NIGHTSMITH_ENV_FILE) return process.env.NIGHTSMITH_ENV_FILE;
  let dir = process.cwd();
  for (;;) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    if (ROOT_MARKERS.some((m) => existsSync(resolve(dir, m)))) break; // at repo root, no .env
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return undefined;
}

/**
 * Minimal, dependency-free `.env` loader run as a side effect. Imported FIRST
 * by the CLI/dev entrypoints so values are present before config is read.
 * Existing process env (real shell exports) always wins — `.env` only fills
 * gaps. Set NIGHTSMITH_ENV_FILE to point elsewhere; missing files are ignored.
 */
function loadEnvFile(): void {
  const path = findEnvFile();
  if (!path || !existsSync(path)) return;
  try {
    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      // Allow a leading `export ` (common when copied from a shell profile).
      if (line.startsWith("export ")) line = line.slice(7).trimStart();
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue; // shell export wins
      let value = line.slice(eq + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) {
        value = value.slice(1, -1);
      } else {
        // Strip an inline comment (whitespace + #) from unquoted values.
        const comment = value.search(/\s#/);
        if (comment >= 0) value = value.slice(0, comment).trim();
      }
      process.env[key] = value;
    }
  } catch {
    // Ignore an unreadable/malformed .env rather than crashing startup.
  }
}

loadEnvFile();
