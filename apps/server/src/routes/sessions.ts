import type { FastifyInstance } from "fastify";
import type {
  SessionDetail,
  SessionListResponse,
} from "@blacksmith/shared";
import { deleteSession, getSession, listSessions } from "../sessions/store.js";

export function registerSessionRoutes(app: FastifyInstance): void {
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
}
