import type { FastifyInstance } from "fastify";
import type { ArtifactListResponse } from "@nightsmith/shared";
import { deleteArtifact, listArtifacts, saveArtifact } from "../artifacts/store.js";

function listSummaries(): ArtifactListResponse {
  return {
    artifacts: listArtifacts().map((a) => ({
      name: a.name,
      functions: a.abi
        .filter((item) => (item as { type?: string }).type === "function")
        .map((item) => String((item as { name?: string }).name ?? ""))
        .filter(Boolean),
    })),
  };
}

export function registerArtifactRoutes(app: FastifyInstance): void {
  app.get("/api/artifacts", async (): Promise<ArtifactListResponse> => listSummaries());

  // Body is validated (and name-sanitized) inside saveArtifact.
  app.post("/api/artifacts", async (req): Promise<ArtifactListResponse> => {
    saveArtifact(req.body);
    return listSummaries();
  });

  app.delete<{ Params: { name: string } }>(
    "/api/artifacts/:name",
    async (req): Promise<{ ok: boolean }> => {
      deleteArtifact(req.params.name);
      return { ok: true };
    },
  );
}
