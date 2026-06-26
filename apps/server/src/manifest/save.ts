import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WorldManifest } from "@blacksmith/shared";
import { ensureDir } from "../utils/paths.js";

/** Write a manifest to disk as pretty JSON. */
export function writeManifest(path: string, manifest: WorldManifest): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}
