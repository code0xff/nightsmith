import { execa } from "execa";
import { platform } from "node:os";
import { join } from "node:path";
import { AppError, errorMessage } from "../utils/errors.js";
import { foundryBinDir } from "./locate.js";
import { isAnvilInstalled, resetAnvilCache } from "./preflight.js";

/** The exact command the user consents to. Hardcoded — no user input. */
export const FOUNDRY_INSTALL_COMMAND = "curl -L https://foundry.paradigm.xyz | bash";

const STEP_TIMEOUT_MS = 300_000; // 5 min per step (downloads can be slow)

export type InstallLog = (
  line: string,
  level?: "info" | "warning" | "error",
) => void;

/** Automatic install is only wired for the official macOS/Linux installer. */
export function isInstallable(): boolean {
  const p = platform();
  return p === "darwin" || p === "linux";
}

async function run(cmd: string, args: string[], onLog: InstallLog): Promise<void> {
  const proc = execa(cmd, args, {
    stdout: "pipe",
    stderr: "pipe",
    timeout: STEP_TIMEOUT_MS,
  });
  const pipe = (stream: NodeJS.ReadableStream | null, level: "info" | "warning") => {
    if (!stream) return;
    let buffer = "";
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLog(trimmed, level);
      }
    });
  };
  pipe(proc.stdout, "info");
  pipe(proc.stderr, "warning");
  await proc;
}

/**
 * Install Foundry via its official installer, then run `foundryup` to fetch the
 * binaries. User-consented and transparent: the command is fixed and every line
 * of output is streamed to `onLog`. Throws an actionable error on any failure.
 */
export async function installFoundry(onLog: InstallLog): Promise<void> {
  if (!isInstallable()) {
    throw new AppError(
      `Automatic install isn't supported on ${platform()}. Install Foundry manually: https://book.getfoundry.sh/getting-started/installation`,
      400,
    );
  }

  try {
    // Hardcoded pipeline (no user input); non-login shell so user rc files
    // don't run as an unexpected side effect.
    onLog(`Running: ${FOUNDRY_INSTALL_COMMAND}`, "info");
    await run("bash", ["-c", FOUNDRY_INSTALL_COMMAND], onLog);

    // Run foundryup directly — no shell, so no path interpolation/injection.
    const foundryup = join(foundryBinDir(), "foundryup");
    onLog("Running foundryup to download anvil, forge, and cast…", "info");
    await run(foundryup, [], onLog);
  } catch (err) {
    throw new AppError(`Foundry install failed: ${errorMessage(err)}`, 500);
  }

  resetAnvilCache();
  if (!(await isAnvilInstalled())) {
    throw new AppError(
      "Install finished but anvil is still not found. Check the logs and try installing manually.",
      500,
    );
  }
  onLog("Anvil installed and ready.", "info");
}
