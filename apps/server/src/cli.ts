import "./loadEnv.js"; // must be first: load .env before config/env reads
import { Command } from "commander";
import { execa } from "execa";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { DEFAULT_ANVIL_PORT, SERVER_HOST, SERVER_PORT } from "./config.js";
import { startServer } from "./server.js";
import { Runtime } from "./runtime/runtime.js";
import { runSavedManifest } from "./executor/runPlan.js";
import { WorldManifest } from "@nightsmith/shared";
import { clearAllSessions, countStoredSessions, getSession } from "./sessions/store.js";
import { clearAllArtifacts, countStoredArtifacts, saveArtifact } from "./artifacts/store.js";
import { compileSolidity } from "./artifacts/compile.js";
import { dataDir } from "./utils/paths.js";
import { errorMessage } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name("nightsmith")
  .description("AI-native local blockchain cockpit for Foundry Anvil")
  .version("0.1.0");

program
  .command("serve")
  .description("Start the Nightsmith server and web cockpit")
  .action(async () => {
    await startServer();
  });

program
  .command("stop")
  .description("Stop the running localnet (via the local server)")
  .action(async () => {
    try {
      const res = await fetch(`http://${SERVER_HOST}:${SERVER_PORT}/api/localnet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      logger.info("Localnet stopped");
    } catch (err) {
      logger.error(
        `Could not reach the Nightsmith server on port ${SERVER_PORT}. Is \`nightsmith serve\` running? (${errorMessage(err)})`,
      );
      process.exit(1);
    }
  });

program
  .command("export")
  .description("Export a session's manifest as JSON")
  .argument("<sessionId>", "session id to export")
  .option("-o, --out <file>", "write to a file instead of stdout")
  .action((sessionId: string, opts: { out?: string }) => {
    const { manifest } = getSession(sessionId);
    const json = JSON.stringify(manifest, null, 2) + "\n";
    if (opts.out) {
      writeFileSync(opts.out, json);
      logger.info(`Exported manifest to ${opts.out}`);
    } else {
      process.stdout.write(json);
    }
  });

program
  .command("replay")
  .description("Replay a saved session headlessly (no browser)")
  .argument("<sessionId>", "session id to replay")
  .action(async (sessionId: string) => {
    const { manifest } = getSession(sessionId);
    const runtime = new Runtime();
    runtime.bus.subscribe((e) => {
      if (e.type === "log" && e.entry.level !== "debug") {
        logger.info(`[${e.entry.level}] ${e.entry.message}`);
      }
    });
    try {
      const res = await runSavedManifest(runtime, manifest);
      logger.info(`Replay ${res.report?.status ?? "finished"}`);
      process.exitCode = res.report?.status === "completed" ? 0 : 1;
    } finally {
      await runtime.stopLocalnet().catch(() => {});
    }
  });

program
  .command("import")
  .description("Import a manifest JSON file and replay it (saves a new session)")
  .argument("<file>", "path to an exported manifest JSON file")
  .action(async (file: string) => {
    let manifest;
    try {
      manifest = WorldManifest.parse(JSON.parse(readFileSync(resolve(file), "utf8")));
    } catch (err) {
      logger.error(`Invalid manifest file: ${errorMessage(err)}`);
      process.exitCode = 1;
      return;
    }
    const runtime = new Runtime();
    runtime.bus.subscribe((e) => {
      if (e.type === "log" && e.entry.level !== "debug") {
        logger.info(`[${e.entry.level}] ${e.entry.message}`);
      }
    });
    try {
      const res = await runSavedManifest(runtime, manifest);
      logger.info(`Imported session ${res.sessionId} — ${res.report?.status ?? "finished"}`);
      process.exitCode = res.report?.status === "completed" ? 0 : 1;
    } finally {
      await runtime.stopLocalnet().catch(() => {});
    }
  });

program
  .command("compile")
  .description("Compile a Solidity file/project with forge and store it as a deployable contract")
  .argument("<path>", "path to a .sol file or a Foundry project directory")
  .option("-c, --contract <name>", "contract to select when the file/project has several")
  .option("-n, --name <name>", "artifact name to store under (defaults to the contract name)")
  .option("-r, --root <dir>", "project root override (for imports/remappings)")
  .action(
    async (path: string, opts: { contract?: string; name?: string; root?: string }) => {
      try {
        const artifact = await compileSolidity({
          path: resolve(path),
          contractName: opts.contract,
          name: opts.name,
          root: opts.root ? resolve(opts.root) : undefined,
        });
        saveArtifact(artifact);
        const fns = artifact.abi
          .filter((i) => (i as { type?: string }).type === "function")
          .map((i) => String((i as { name?: string }).name ?? ""))
          .filter(Boolean);
        logger.info(`Compiled and stored "${artifact.name}" (${dataDir()}/artifacts)`);
        logger.info(`  functions: ${fns.join(", ") || "(none)"}`);
      } catch (err) {
        logger.error(errorMessage(err));
        process.exit(1);
      }
    },
  );

program
  .command("doctor")
  .description("Check toolchain availability and ports")
  .action(async () => {
    let ok = true;
    // `anvil` is required (every world spawns it). `forge` is required only to
    // compile Solidity sources (`nightsmith compile` / the compile route); it's
    // optional for anvil-only worlds. `cast` is diagnostic-only.
    const anvilVersion = await toolVersion("anvil");
    if (anvilVersion) {
      logger.info(`anvil: ${anvilVersion}`);
    } else {
      logger.error("anvil: not found on PATH (required)");
      ok = false;
    }
    const forgeVersion = await toolVersion("forge");
    logger.info(
      forgeVersion
        ? `forge: ${forgeVersion}`
        : "forge: not found (required to compile .sol sources)",
    );
    const castVersion = await toolVersion("cast");
    logger.info(castVersion ? `cast: ${castVersion}` : "cast: not found (optional — diagnostic only)");
    for (const [label, port] of [
      ["server", SERVER_PORT],
      ["anvil", DEFAULT_ANVIL_PORT],
    ] as const) {
      const free = await portIsFree(port);
      logger.info(`port ${port} (${label}): ${free ? "available" : "in use"}`);
    }
    if (!ok) {
      logger.error("Some tools are missing. Install Foundry: https://book.getfoundry.sh/");
      process.exit(1);
    }
    logger.info("doctor: all required tools present");
  });

program
  .command("clean")
  .description("Delete all saved sessions and uploaded contracts (fresh state)")
  .option("-y, --yes", "skip the confirmation prompt")
  .action(async (opts: { yes?: boolean }) => {
    // Count RAW directory contents, not parseable entries — a corrupt/partial
    // session dir or artifact file must still count as "not clean" and get
    // wiped, not slip past the short-circuit below.
    const sessions = countStoredSessions();
    const artifacts = countStoredArtifacts();
    if (sessions === 0 && artifacts === 0) {
      logger.info("Already clean — nothing to remove.");
      return;
    }

    const target = resolve(dataDir());
    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        logger.error("Refusing to clean without confirmation. Re-run with --yes.");
        process.exit(1);
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(
          `Delete ${sessions} session(s) and ${artifacts} uploaded contract(s) from ${target}? [y/N] `,
        );
        if (!/^y(es)?$/i.test(answer.trim())) {
          logger.info("Aborted — nothing removed.");
          return;
        }
      } finally {
        rl.close();
      }
    }

    // Stop a running localnet first so no orphaned Anvil is left behind.
    const serverUp = await stopLocalnetIfRunning();

    clearAllSessions();
    clearAllArtifacts();
    logger.info(
      `Removed ${sessions} session(s) and ${artifacts} uploaded contract(s) from ${target}. Built-in MockERC20 remains.`,
    );
    if (serverUp) {
      logger.info(
        `A server is running on ${SERVER_HOST}:${SERVER_PORT} — restart it for a fully fresh in-memory runtime.`,
      );
    }
  });

/** Best-effort: if the server is up, stop its localnet. Returns whether the server responded. */
async function stopLocalnetIfRunning(): Promise<boolean> {
  const base = `http://${SERVER_HOST}:${SERVER_PORT}`;
  try {
    const health = await fetch(`${base}/api/health`);
    if (!health.ok) return false;
  } catch {
    return false; // no server running — nothing to stop
  }
  try {
    await fetch(`${base}/api/localnet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  } catch {
    // Non-fatal — proceed with the file wipe regardless.
  }
  return true;
}

async function toolVersion(tool: string): Promise<string | null> {
  try {
    const { stdout } = await execa(tool, ["--version"]);
    return stdout.split("\n")[0]?.trim() ?? "ok";
  } catch {
    return null;
  }
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, SERVER_HOST);
  });
}

program.parseAsync().catch((err) => {
  logger.error(errorMessage(err));
  process.exit(1);
});
