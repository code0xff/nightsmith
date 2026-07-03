import type { FastifyInstance } from "fastify";
import {
  LocalnetActionRequest,
  NetworkConfig,
  type LocalnetActionResponse,
  type WorldState,
} from "@nightsmith/shared";
import { AppError } from "../utils/errors.js";
import type { Runtime } from "../runtime/runtime.js";

/** A default local Anvil network for manual (non-manifest) control. */
function defaultNetwork() {
  return NetworkConfig.parse({ kind: "anvil-local" });
}

export function registerLocalnetRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get("/api/localnet", async (): Promise<WorldState> => {
    await runtime.refreshChainStatus();
    return runtime.getState();
  });

  app.post("/api/localnet", async (req): Promise<LocalnetActionResponse> => {
    const body = LocalnetActionRequest.parse(req.body);
    if (runtime.isInstalling()) {
      throw new AppError("Foundry is installing — try again shortly", 423);
    }

    // Serialize against execution and other control actions (single Anvil owner).
    return runtime.runExclusive(async () => {
      switch (body.action) {
        case "start":
          await runtime.startLocalnet(defaultNetwork());
          break;
        case "stop":
          await runtime.stopLocalnet();
          break;
        case "clear":
          if (runtime.isRunning()) {
            throw new AppError("Stop the localnet before clearing", 409);
          }
          runtime.clearWorld();
          break;
      }
      return { ok: true, state: runtime.getState() };
    });
  });
}
