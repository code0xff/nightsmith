import type { FastifyInstance } from "fastify";
import type { ArtifactListResponse, ArtifactSummary } from "@nightsmith/shared";
import { MockERC20 } from "@nightsmith/contracts";
import {
  BUILTIN_MOCK_ERC20,
  deleteArtifact,
  listArtifacts,
  saveArtifact,
} from "../artifacts/store.js";

/** Function names declared by an ABI (in declaration order). */
function functionNames(abi: readonly unknown[]): string[] {
  return abi
    .filter((item) => (item as { type?: string }).type === "function")
    .map((item) => String((item as { name?: string }).name ?? ""))
    .filter(Boolean);
}

/** The always-present built-in MockERC20 entry (undeletable). */
function builtinMockErc20(): ArtifactSummary {
  return { name: BUILTIN_MOCK_ERC20, functions: functionNames(MockERC20.abi), builtin: true };
}

function listSummaries(): ArtifactListResponse {
  // listArtifacts() already excludes the reserved built-in name, so uploads
  // can never shadow the synthetic built-in entry prepended here.
  const uploaded: ArtifactSummary[] = listArtifacts().map((a) => ({
    name: a.name,
    functions: functionNames(a.abi),
    builtin: false,
  }));
  return { artifacts: [builtinMockErc20(), ...uploaded] };
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
