import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AnvilStatus } from "@blacksmith/shared";
import { isAnvilInstalled } from "../anvil/preflight.js";
import {
  FOUNDRY_INSTALL_COMMAND,
  installFoundry,
  isInstallable,
} from "../anvil/install.js";
import { AppError } from "../utils/errors.js";
import type { Runtime } from "../runtime/runtime.js";

// Per-process secret. A cross-origin page can't read GET /api/anvil (CORS) and
// can't set the custom header on a simple request, so it can't trigger install.
const INSTALL_TOKEN = randomBytes(16).toString("hex");

async function status(): Promise<AnvilStatus> {
  return {
    installed: await isAnvilInstalled(),
    installable: isInstallable(),
    installCommand: FOUNDRY_INSTALL_COMMAND,
    installToken: INSTALL_TOKEN,
  };
}

export function registerAnvilRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get("/api/anvil", async (): Promise<AnvilStatus> => status());

  app.post("/api/anvil/install", async (req): Promise<AnvilStatus> => {
    if (req.headers["x-blacksmith-install-token"] !== INSTALL_TOKEN) {
      throw new AppError("Missing or invalid install token", 403);
    }
    if (runtime.isInstalling()) {
      throw new AppError("An install is already in progress", 409);
    }
    if (await isAnvilInstalled()) {
      runtime.log("info", "Anvil is already installed", "install");
      return status();
    }

    // Use a dedicated flag (not the runtime mutex) so a multi-minute install
    // doesn't block execute/localnet — those fail fast with 423 instead.
    runtime.setInstalling(true);
    try {
      runtime.log("info", "Installing Foundry (anvil)…", "install");
      await installFoundry((line, level = "info") => runtime.log(level, line, "install"));
      runtime.log("success", "Foundry installed — Anvil is ready", "install");
      return status();
    } finally {
      runtime.setInstalling(false);
    }
  });
}
