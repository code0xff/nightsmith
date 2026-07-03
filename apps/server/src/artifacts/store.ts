import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { UploadedArtifact } from "@nightsmith/shared";
import { AppError } from "../utils/errors.js";
import { dataDir, ensureDir } from "../utils/paths.js";

const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Name reserved for the built-in MockERC20. It's a compiled-in default
 * contract (packages/contracts), not an uploaded artifact — surfaced in the
 * Contracts card as an undeletable built-in, so its name can't be uploaded,
 * overwritten, or deleted.
 */
export const BUILTIN_MOCK_ERC20 = "MockERC20";

function artifactsDir(): string {
  return join(dataDir(), "artifacts");
}

function assertName(name: string): string {
  if (!SAFE_NAME.test(name)) throw new AppError(`Invalid artifact name "${name}"`, 400);
  return name;
}

function pathFor(name: string): string {
  return join(artifactsDir(), `${assertName(name)}.json`);
}

/** Persist an uploaded artifact (validated). Overwrites by name. */
export function saveArtifact(input: unknown): UploadedArtifact {
  const artifact = UploadedArtifact.parse(input);
  assertName(artifact.name);
  if (artifact.name === BUILTIN_MOCK_ERC20) {
    throw new AppError(`"${BUILTIN_MOCK_ERC20}" is a reserved built-in contract name`, 400);
  }
  ensureDir(artifactsDir());
  writeFileSync(pathFor(artifact.name), JSON.stringify(artifact, null, 2) + "\n");
  return artifact;
}

export function listArtifacts(): UploadedArtifact[] {
  const dir = artifactsDir();
  if (!existsSync(dir)) return [];
  const out: UploadedArtifact[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = UploadedArtifact.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      // Never surface a stray file named like the built-in — it must not
      // shadow the compiled-in MockERC20 for the planner, hydration, or UI.
      if (parsed.name === BUILTIN_MOCK_ERC20) continue;
      out.push(parsed);
    } catch {
      // Skip corrupt entries.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getArtifact(name: string): UploadedArtifact | null {
  // The built-in is compiled in (kind:"MockERC20"), never an uploaded artifact;
  // refuse to resolve a stale/stray on-disk file by that name.
  if (name === BUILTIN_MOCK_ERC20) return null;
  const path = pathFor(name);
  if (!existsSync(path)) return null;
  try {
    return UploadedArtifact.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function deleteArtifact(name: string): void {
  if (name === BUILTIN_MOCK_ERC20) {
    throw new AppError(`"${BUILTIN_MOCK_ERC20}" is a built-in contract and cannot be deleted`, 400);
  }
  const path = pathFor(name);
  if (existsSync(path)) rmSync(path);
}

/** Raw count of stored artifact files (includes corrupt/unparseable ones). */
export function countStoredArtifacts(): number {
  const dir = artifactsDir();
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith(".json")).length;
}

/** Delete every uploaded artifact (used by `nightsmith clean`). The built-in
 *  MockERC20 is synthetic (never on disk), so it's unaffected. */
export function clearAllArtifacts(): void {
  rmSync(artifactsDir(), { recursive: true, force: true });
}
