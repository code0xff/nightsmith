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
      out.push(UploadedArtifact.parse(JSON.parse(readFileSync(join(dir, file), "utf8"))));
    } catch {
      // Skip corrupt entries.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getArtifact(name: string): UploadedArtifact | null {
  const path = pathFor(name);
  if (!existsSync(path)) return null;
  try {
    return UploadedArtifact.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function deleteArtifact(name: string): void {
  const path = pathFor(name);
  if (existsSync(path)) rmSync(path);
}
