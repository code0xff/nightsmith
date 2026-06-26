import type { FastifyInstance } from "fastify";
import type { AnvilStatus } from "@blacksmith/shared";
import { isAnvilInstalled } from "../anvil/preflight.js";
import {
  FOUNDRY_INSTALL_COMMAND,
  installFoundry,
  isInstallable,
} from "../anvil/install.js";
import type { Runtime } from "../runtime/runtime.js";

async function status(): Promise<AnvilStatus> {
  return {
    installed: await isAnvilInstalled(),
    installable: isInstallable(),
    installCommand: FOUNDRY_INSTALL_COMMAND,
  };
}

export function registerAnvilRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get("/api/anvil", async (): Promise<AnvilStatus> => status());

  // User-consented install. Serialized with execute/localnet (the mutex) and
  // streamed to the log console so the user sees exactly what runs.
  app.post("/api/anvil/install", async (): Promise<AnvilStatus> =>
    runtime.runExclusive(async () => {
      if (await isAnvilInstalled()) {
        runtime.log("info", "Anvil is already installed", "install");
        return status();
      }
      runtime.log("info", "Installing Foundry (anvil)…", "install");
      await installFoundry((line, level = "info") => runtime.log(level, line, "install"));
      runtime.log("success", "Foundry installed — Anvil is ready", "install");
      return status();
    }),
  );
}
