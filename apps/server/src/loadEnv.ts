import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal, dependency-free `.env` loader run as a side effect. Imported FIRST
 * by the CLI/dev entrypoints so values are present before config is read.
 * Existing process env (real shell exports) always wins — `.env` only fills
 * gaps. Set NIGHTSMITH_ENV_FILE to point elsewhere; missing files are ignored.
 */
function loadEnvFile(): void {
  const path = process.env.NIGHTSMITH_ENV_FILE ?? resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
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
