import type { FastifyInstance } from "fastify";
import {
  LocalnetActionRequest,
  NetworkConfig,
  type LocalnetActionResponse,
  type WorldState,
} from "@blacksmith/shared";
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

    // Serialize against execution and other control actions (single Anvil owner).
    return runtime.runExclusive(async () => {
      let snapshotId: string | undefined;
      switch (body.action) {
        case "start":
          await runtime.startLocalnet(defaultNetwork());
          break;
        case "stop":
          await runtime.stopLocalnet();
          break;
        case "reset":
          if (runtime.isRunning()) await runtime.stopLocalnet();
          await runtime.startLocalnet(defaultNetwork());
          break;
        case "snapshot":
          snapshotId = await runtime.snapshot();
          break;
        case "revert":
          await runtime.revert(body.snapshotId);
          break;
      }
      return {
        ok: true,
        state: runtime.getState(),
        ...(snapshotId ? { snapshotId } : {}),
      };
    });
  });
}
