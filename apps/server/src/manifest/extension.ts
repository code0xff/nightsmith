import type { WorldManifest } from "@nightsmith/shared";
import { AppError } from "../utils/errors.js";

const REWRITE_HINT =
  "This change rewrites the running world's history. Ask to modify or recreate the world to rebuild it from scratch instead.";

const eq = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Existing entries (keyed by `key`) must survive unchanged; new ones may be added. */
function requireSuperset<T extends Record<string, unknown>>(
  prev: T[],
  next: T[],
  key: keyof T,
  label: string,
  problems: string[],
): void {
  const byKey = new Map(next.map((x) => [x[key], x]));
  for (const p of prev) {
    const n = byKey.get(p[key]);
    if (!n) problems.push(`${label} "${String(p[key])}" was removed`);
    else if (!eq(p, n)) problems.push(`${label} "${String(p[key])}" was modified`);
  }
}

/**
 * Guard for an `extendWorld` execution: the next manifest must be a strict
 * extension of what is already live — same network, the already-applied actions
 * preserved verbatim as a prefix, and accounts/contracts only added (never
 * removed or mutated). This is what makes it safe to apply just the new action
 * suffix on top of the running Anvil. Throws AppError(409) on any rewrite.
 */
export function validateExtension(
  applied: WorldManifest,
  next: WorldManifest,
  appliedCount: number,
): void {
  const problems: string[] = [];

  if (!eq(applied.network, next.network)) problems.push("network config changed");

  if (next.actions.length < appliedCount) {
    problems.push(
      `removes already-applied actions (${appliedCount} applied, next has ${next.actions.length})`,
    );
  } else if (!eq(applied.actions.slice(0, appliedCount), next.actions.slice(0, appliedCount))) {
    problems.push("reorders or edits already-applied actions");
  }

  requireSuperset(applied.accounts, next.accounts, "name", "account", problems);
  requireSuperset(applied.contracts, next.contracts, "id", "contract", problems);

  if (problems.length > 0) {
    throw new AppError(`Cannot extend the running world — ${REWRITE_HINT}`, 409, problems);
  }
}
