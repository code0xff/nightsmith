import type { FastifyInstance } from "fastify";
import type {
  ExecuteResponse,
  SessionDetail,
  SessionListResponse,
} from "@blacksmith/shared";
import { deleteSession, getSession, listSessions } from "../sessions/store.js";
import { runSavedManifest } from "../executor/runPlan.js";
import type { Runtime } from "../runtime/runtime.js";

export function registerSessionRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get("/api/sessions", async (): Promise<SessionListResponse> => ({
    sessions: listSessions(),
  }));

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req): Promise<SessionDetail> => getSession(req.params.id),
  );

  app.delete<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req): Promise<{ ok: boolean }> => {
      deleteSession(req.params.id);
      return { ok: true };
    },
  );

  // Resume = replay a saved session's manifest from a clean localnet.
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/resume",
    async (req): Promise<ExecuteResponse> => {
      const { manifest } = getSession(req.params.id);
      return runtime.runExclusive(() => runSavedManifest(runtime, manifest));
    },
  );
}
