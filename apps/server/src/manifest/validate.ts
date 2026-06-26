import { parseManifest, type WorldManifest } from "@blacksmith/shared";
import { AppError } from "../utils/errors.js";

/**
 * Validate a manifest: zod shape + defaults, then semantic checks that every
 * action/assertion references a declared account/contract. Throws AppError
 * with a list of problems on failure.
 */
export function validateManifest(input: unknown): WorldManifest {
  const manifest = parseManifest(input);

  const accountNames = new Set(manifest.accounts.map((a) => a.name));
  const contractIds = new Set(manifest.contracts.map((c) => c.id));
  const problems: string[] = [];

  const requireAccount = (name: string, where: string) => {
    if (!accountNames.has(name)) problems.push(`${where}: unknown account "${name}"`);
  };
  const requireContract = (id: string, where: string) => {
    if (!contractIds.has(id)) problems.push(`${where}: unknown contract "${id}"`);
  };

  for (const [i, action] of manifest.actions.entries()) {
    const where = `actions[${i}] (${action.type})`;
    requireContract(action.contractId, where);
    if (action.type === "deployContract") requireAccount(action.deployer, where);
    if (action.type === "mint") requireAccount(action.to, where);
    if (action.type === "transfer") {
      requireAccount(action.from, where);
      requireAccount(action.to, where);
    }
  }

  for (const [i, assertion] of manifest.assertions.entries()) {
    const where = `assertions[${i}] (${assertion.type})`;
    requireContract(assertion.contractId, where);
    requireAccount(assertion.account, where);
  }

  // Duplicate ids/names are a determinism hazard.
  if (accountNames.size !== manifest.accounts.length) {
    problems.push("duplicate account names");
  }
  if (contractIds.size !== manifest.contracts.length) {
    problems.push("duplicate contract ids");
  }

  if (problems.length > 0) {
    throw new AppError("Manifest failed validation", 422, problems);
  }
  return manifest;
}
