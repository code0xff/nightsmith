import "./loadEnv.js"; // must be first: load .env before config/env reads
import { Command } from "commander";
import { execa } from "execa";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { DEFAULT_ANVIL_PORT, SERVER_HOST, SERVER_PORT } from "./config.js";
import { startServer } from "./server.js";
import { Runtime } from "./runtime/runtime.js";
import { runSavedManifest } from "./executor/runPlan.js";
import { getSession } from "./sessions/store.js";
import { errorMessage } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name("blacksmith")
  .description("AI-native local blockchain cockpit for Foundry Anvil")
  .version("0.1.0");

program
  .command("serve")
  .description("Start the Blacksmith server and web cockpit")
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
        `Could not reach the Blacksmith server on port ${SERVER_PORT}. Is \`blacksmith serve\` running? (${errorMessage(err)})`,
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
  .command("doctor")
  .description("Check toolchain availability and ports")
  .action(async () => {
    let ok = true;
    for (const tool of ["anvil", "forge", "cast"]) {
      const version = await toolVersion(tool);
      if (version) {
        logger.info(`${tool}: ${version}`);
      } else {
        logger.error(`${tool}: not found on PATH`);
        ok = false;
      }
    }
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
