import type { WorldManifest } from "@blacksmith/shared";

/** A single human-readable change between two manifests. */
export interface ManifestChange {
  path: string;
  before: string;
  after: string;
}

function indexActions(m: WorldManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of m.actions) {
    if (a.type === "mint") map.set(`mint:${a.contractId}:${a.to}`, a.amount);
    if (a.type === "transfer")
      map.set(`transfer:${a.contractId}:${a.from}->${a.to}`, a.amount);
  }
  return map;
}

/**
 * Compute a shallow, human-readable diff between two manifests, focused on the
 * fields the planner typically changes (amounts, accounts, assertions).
 */
export function diffManifests(
  before: WorldManifest,
  after: WorldManifest,
): ManifestChange[] {
  const changes: ManifestChange[] = [];

  if (before.name !== after.name) {
    changes.push({ path: "name", before: before.name, after: after.name });
  }

  const beforeActions = indexActions(before);
  const afterActions = indexActions(after);
  for (const [key, afterAmount] of afterActions) {
    const beforeAmount = beforeActions.get(key);
    if (beforeAmount !== afterAmount) {
      changes.push({
        path: key,
        before: beforeAmount ?? "(none)",
        after: afterAmount,
      });
    }
  }
  for (const [key, beforeAmount] of beforeActions) {
    if (!afterActions.has(key)) {
      changes.push({ path: key, before: beforeAmount, after: "(removed)" });
    }
  }

  const assertKey = (a: WorldManifest["assertions"][number]) =>
    `${a.account}:${a.contractId}`;
  const beforeAsserts = new Map(before.assertions.map((a) => [assertKey(a), a.expected]));
  for (const a of after.assertions) {
    const prev = beforeAsserts.get(assertKey(a));
    if (prev !== a.expected) {
      changes.push({
        path: `assert:${assertKey(a)}`,
        before: prev ?? "(none)",
        after: a.expected,
      });
    }
  }

  return changes;
}
