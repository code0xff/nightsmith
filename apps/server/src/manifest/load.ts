import { readFileSync } from "node:fs";
import type { WorldManifest } from "@blacksmith/shared";
import { validateManifest } from "./validate.js";

/** Read and validate a manifest from disk. */
export function readManifest(path: string): WorldManifest {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return validateManifest(raw);
}
