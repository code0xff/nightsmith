import type { FastifyInstance } from "fastify";
import {
  CompileArtifactRequest,
  type ArtifactListResponse,
  type ArtifactSummary,
  type InspectArtifactsResponse,
} from "@nightsmith/shared";
import { MockERC20 } from "@nightsmith/contracts";
import {
  BUILTIN_MOCK_ERC20,
  deleteArtifact,
  listArtifacts,
  saveArtifact,
} from "../artifacts/store.js";
import { compileSolidity, inspectSolidity } from "../artifacts/compile.js";
import type { Runtime } from "../runtime/runtime.js";

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

export function registerArtifactRoutes(app: FastifyInstance, runtime: Runtime): void {
  app.get("/api/artifacts", async (): Promise<ArtifactListResponse> => listSummaries());

  // Body is validated (and name-sanitized) inside saveArtifact.
  app.post("/api/artifacts", async (req): Promise<ArtifactListResponse> => {
    saveArtifact(req.body);
    return listSummaries();
  });

  // Compile a .sol (source | local path | base64 zip) with forge, then store
  // the resulting artifact just like an upload. The compiled abi+bytecode are
  // inlined by saveArtifact, so replay/import never need the source or forge.
  // Raise the body limit past Fastify's 1 MiB default so a base64 project zip
  // fits; compile.ts enforces the real archive/expansion caps.
  app.post(
    "/api/artifacts/compile",
    { bodyLimit: 40 * 1024 * 1024 },
    async (req): Promise<ArtifactListResponse> => {
      const input = CompileArtifactRequest.parse(req.body);
      // Stream forge output (incl. a first-time solc download) to the log
      // console so a long compile shows progress instead of a dead spinner.
      runtime.log("info", "Compiling with forge…", "compile");
      const artifact = await compileSolidity(input, (line, level) =>
        runtime.log(level, line, "compile"),
      );
      saveArtifact(artifact);
      runtime.log("success", `Compiled and stored "${artifact.name}"`, "compile");
      return listSummaries();
    },
  );

  // Build a source/project/zip ONCE and return every deployable contract as an
  // (unsaved) artifact, so the UI can list them and register a chosen subset via
  // POST /api/artifacts. Same body limit + forge-log streaming as compile.
  app.post(
    "/api/artifacts/inspect",
    { bodyLimit: 40 * 1024 * 1024 },
    async (req): Promise<InspectArtifactsResponse> => {
      const input = CompileArtifactRequest.parse(req.body);
      runtime.log("info", "Compiling with forge…", "compile");
      const contracts = await inspectSolidity(input, (line, level) =>
        runtime.log(level, line, "compile"),
      );
      runtime.log("success", `Found ${contracts.length} deployable contract(s)`, "compile");
      return { contracts };
    },
  );

  app.delete<{ Params: { name: string } }>(
    "/api/artifacts/:name",
    async (req): Promise<{ ok: boolean }> => {
      deleteArtifact(req.params.name);
      return { ok: true };
    },
  );
}
