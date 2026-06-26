/**
 * Minimal stderr logger for server bootstrap and CLI output. Execution logs
 * that belong in the UI flow through the runtime event bus instead.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string): void {
  const prefix = level === "info" ? "•" : level === "warn" ? "!" : "✗";
  process.stderr.write(`${prefix} ${msg}\n`);
}

export const logger = {
  info: (msg: string) => emit("info", msg),
  warn: (msg: string) => emit("warn", msg),
  error: (msg: string) => emit("error", msg),
};
