import type { WorldManifest } from "@nightsmith/shared";
import { AppError } from "../utils/errors.js";
import { getArtifact } from "./store.js";

/**
 * Fill in abi+bytecode for `artifact` contracts from the uploaded-artifact store
 * (matched by name). The planner only needs to reference an artifact by name;
 * this makes the manifest self-contained before preview/execution.
 */
export function hydrateArtifacts(manifest: WorldManifest): WorldManifest {
  let changed = false;
  const contracts = manifest.contracts.map((c) => {
    if (c.kind !== "artifact") return c;
    if (c.abi.length > 0 && c.bytecode !== "0x") return c; // already complete
    const artifact = getArtifact(c.name);
    if (!artifact) {
      throw new AppError(
        `Unknown uploaded artifact "${c.name}". Upload it first, or check the name.`,
        400,
      );
    }
    changed = true;
    return { ...c, abi: artifact.abi, bytecode: artifact.bytecode };
  });
  return changed ? { ...manifest, contracts } : manifest;
}
