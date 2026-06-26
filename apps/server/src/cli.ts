import { Command } from "commander";
import { execa } from "execa";
import { createServer } from "node:net";
import { DEFAULT_ANVIL_PORT, SERVER_HOST, SERVER_PORT } from "./config.js";
import { startServer } from "./server.js";
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
      if (free) logger.info(`port ${port} (${label}): available`);
      else logger.warn(`port ${port} (${label}): in use`);
    }
    if (!ok) {
      logger.error("Some tools are missing. Install Foundry: https://book.getfoundry.sh/");
      process.exit(1);
    }
    logger.info("doctor: all required tools present");
  });

// Filled out in a later phase; declared now so `--help` lists them.
program
  .command("stop")
  .description("Stop a running localnet (coming soon)")
  .action(() => logger.warn("`blacksmith stop` is not implemented yet"));
program
  .command("export")
  .description("Export a session manifest (coming soon)")
  .action(() => logger.warn("`blacksmith export` is not implemented yet"));
program
  .command("replay")
  .description("Replay a saved session (coming soon)")
  .action(() => logger.warn("`blacksmith replay` is not implemented yet"));

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
  logger.error(String(err));
  process.exit(1);
});
