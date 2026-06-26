import { isAddress, parseManifest, type WorldManifest } from "@nightsmith/shared";
import { AppError } from "../utils/errors.js";

/**
 * Validate a manifest: zod shape + defaults, then semantic checks that every
 * action/assertion references a declared account/contract. Throws AppError
 * with a list of problems on failure.
 */
export function validateManifest(input: unknown): WorldManifest {
  const manifest = parseManifest(input);

  // Canonicalize literal-address refs to lowercase so the same address in
  // different casings can't desync recipient vs. assertion balances.
  for (const action of manifest.actions) {
    if ((action.type === "mint" || action.type === "transfer") && isAddress(action.to)) {
      action.to = action.to.toLowerCase();
    }
  }
  for (const assertion of manifest.assertions) {
    if (assertion.type === "tokenBalance" && isAddress(assertion.account)) {
      assertion.account = assertion.account.toLowerCase();
    }
  }

  const accountNames = new Set(manifest.accounts.map((a) => a.name));
  const contractIds = new Set(manifest.contracts.map((c) => c.id));
  const problems: string[] = [];

  const requireAccount = (name: string, where: string) => {
    if (!accountNames.has(name)) problems.push(`${where}: unknown account "${name}"`);
  };
  const requireContract = (id: string, where: string) => {
    if (!contractIds.has(id)) problems.push(`${where}: unknown contract "${id}"`);
  };
  // A recipient/assertion target may be a literal 0x address; only named refs
  // need to exist in accounts[].
  const requireRecipient = (ref: string, where: string) => {
    if (!isAddress(ref)) requireAccount(ref, where);
  };

  for (const [i, action] of manifest.actions.entries()) {
    const where = `actions[${i}] (${action.type})`;
    requireContract(action.contractId, where);
    if (action.type === "deployContract") requireAccount(action.deployer, where);
    if (action.type === "mint") requireRecipient(action.to, where);
    if (action.type === "transfer") {
      requireAccount(action.from, where); // sender must be a signable named account
      requireRecipient(action.to, where);
    }
    if (action.type === "call") requireAccount(action.from, where); // signer
  }

  for (const [i, assertion] of manifest.assertions.entries()) {
    const where = `assertions[${i}] (${assertion.type})`;
    requireContract(assertion.contractId, where);
    if (assertion.type === "tokenBalance") requireRecipient(assertion.account, where);
  }

  // Uploaded artifacts must be hydrated (abi+bytecode) before execution.
  for (const [i, c] of manifest.contracts.entries()) {
    if (c.kind === "artifact" && (c.abi.length === 0 || c.bytecode === "0x")) {
      problems.push(`contracts[${i}] (${c.id}): artifact "${c.name}" is missing abi/bytecode`);
    }
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
