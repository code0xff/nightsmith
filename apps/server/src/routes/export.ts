import type { FastifyInstance } from "fastify";
import { getSession } from "../sessions/store.js";

/** Manifest export: a downloadable, replayable JSON manifest for a session. */
export function registerExportRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/export/:id", async (req, reply) => {
    const { manifest } = getSession(req.params.id);
    reply
      .header("content-type", "application/json")
      .header(
        "content-disposition",
        `attachment; filename="${req.params.id}.manifest.json"`,
      )
      .send(JSON.stringify(manifest, null, 2));
  });
}
