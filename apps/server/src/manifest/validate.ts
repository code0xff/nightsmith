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
  const lower = (s: string) => s.toLowerCase();
  for (const action of manifest.actions) {
    if ((action.type === "mint" || action.type === "transfer") && isAddress(action.to)) {
      action.to = lower(action.to);
    }
    if (action.type === "transfer" && isAddress(action.from)) action.from = lower(action.from);
    if (action.type === "approve") {
      if (isAddress(action.spender)) action.spender = lower(action.spender);
      if (isAddress(action.owner)) action.owner = lower(action.owner);
    }
    if (action.type === "call" && isAddress(action.from)) action.from = lower(action.from);
  }
  for (const assertion of manifest.assertions) {
    if (
      (assertion.type === "tokenBalance" || assertion.type === "ethBalance") &&
      isAddress(assertion.account)
    ) {
      assertion.account = assertion.account.toLowerCase();
    }
    if (assertion.type === "allowance") {
      if (isAddress(assertion.owner)) assertion.owner = assertion.owner.toLowerCase();
      if (isAddress(assertion.spender)) assertion.spender = assertion.spender.toLowerCase();
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
    // Most actions target a contract; `mine` (chain control) does not.
    if ("contractId" in action) requireContract(action.contractId, where);
    if (action.type === "deployContract") requireAccount(action.deployer, where);
    if (action.type === "mint") requireRecipient(action.to, where);
    if (action.type === "transfer") {
      requireRecipient(action.from, where); // named account (signed) or address (impersonated)
      requireRecipient(action.to, where);
    }
    if (action.type === "approve") {
      requireRecipient(action.owner, where); // named account (signed) or address (impersonated)
      requireRecipient(action.spender, where);
    }
    if (action.type === "call") requireRecipient(action.from, where); // signer or impersonated address
  }

  for (const [i, assertion] of manifest.assertions.entries()) {
    const where = `assertions[${i}] (${assertion.type})`;
    // Most assertions target a contract; `ethBalance` (native) does not.
    if ("contractId" in assertion) requireContract(assertion.contractId, where);
    if (assertion.type === "ethBalance") requireRecipient(assertion.account, where);
    if (assertion.type === "tokenBalance") requireRecipient(assertion.account, where);
    if (assertion.type === "allowance") {
      requireRecipient(assertion.owner, where);
      requireRecipient(assertion.spender, where);
    }
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
  // Two names sharing an addressIndex alias the same on-chain account. That
  // aliasing executes differently under incremental extend (accounts funded
  // after prior actions) than a from-genesis replay, breaking determinism.
  const indices = manifest.accounts.map((a) => a.addressIndex);
  if (new Set(indices).size !== indices.length) {
    problems.push("duplicate account addressIndex");
  }

  if (problems.length > 0) {
    throw new AppError("Manifest failed validation", 422, problems);
  }
  return manifest;
}
