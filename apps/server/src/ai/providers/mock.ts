import type { Action, Plan, WorldManifest } from "@nightsmith/shared";
import { diffManifests } from "../../manifest/diff.js";
import {
  detectIntent,
  parseBalanceChange,
  parseBalances,
  parseControl,
  parseToken,
  parseTransfer,
} from "../parse.js";
import { buildManifest, deriveParams, type WorldParams } from "../worldBuilder.js";
import type { AiProvider, PlanInput } from "./types.js";

const SAFETY_NOTES = (symbol: string): string[] => [
  "Runs on local Anvil only — nothing is broadcast to a public network.",
  `${symbol} is a local MockERC20, not a real token.`,
  "No private keys are used or requested; accounts are Anvil's public test keys.",
];

function describeAction(a: Action): string {
  switch (a.type) {
    case "deployContract":
      return `Deploy ${a.contractId} (deployer: ${a.deployer})`;
    case "mint":
      return `Mint ${a.amount} ${a.contractId} → ${a.to}`;
    case "transfer":
      return `Transfer ${a.amount} ${a.contractId}: ${a.from} → ${a.to}`;
  }
}

function stepsFor(manifest: WorldManifest): string[] {
  const accountNames = manifest.accounts.map((a) => a.name).join(", ");
  return [
    `Start local Anvil (chainId ${manifest.network.chainId})`,
    `Create accounts: ${accountNames}`,
    ...manifest.actions.map(describeAction),
  ];
}

function expectedChanges(manifest: WorldManifest): string[] {
  return manifest.assertions.map((a) =>
    a.type === "tokenBalance" ? `${a.account}: ${a.expected} ${manifest.contracts[0]?.symbol ?? ""}`.trim() : "",
  ).filter(Boolean);
}

function assertionDescriptions(manifest: WorldManifest): string[] {
  return manifest.assertions.map(
    (a) => a.description ?? `${a.account} = ${a.expected}`,
  );
}

/** Assemble a create/modify/run plan from a finished manifest. */
function planFromManifest(
  intent: Plan["intent"],
  manifest: WorldManifest,
  parts: { summary: string; assumptions: string[]; title: string; description: string },
): Plan {
  const symbol = manifest.contracts[0]?.symbol ?? "TOKEN";
  return {
    intent,
    summary: parts.summary,
    assumptions: parts.assumptions,
    steps: stepsFor(manifest),
    expectedStateChanges: expectedChanges(manifest),
    assertions: assertionDescriptions(manifest),
    safetyNotes: SAFETY_NOTES(symbol),
    manifest,
    control: null,
    explanation: null,
    uiPreview: { title: parts.title, description: parts.description, accent: "default" },
  };
}

function demoDefaults(): { accounts: WorldParams["accounts"]; transfer: WorldParams["transfer"]; assumed: boolean } {
  return {
    accounts: [
      { ref: "Alice", initial: "1000" },
      { ref: "Bob", initial: "100" },
    ],
    transfer: { from: "Alice", to: "Bob", amount: "10" },
    assumed: true,
  };
}

function createWorldPlan(prompt: string): Plan {
  const token = parseToken(prompt);
  let accounts: WorldParams["accounts"] = parseBalances(prompt).map((b) => ({
    ref: b.ref,
    initial: b.amount,
  }));
  let transfer = parseTransfer(prompt);
  const assumptions: string[] = [];

  if (accounts.length === 0 && !transfer) {
    const d = demoDefaults();
    accounts = d.accounts;
    transfer = d.transfer;
    assumptions.push(
      "No explicit balances found — assumed a default Alice/Bob payment world.",
    );
  }
  assumptions.push(`Treated "${token.symbol}" as a local MockERC20 (${token.decimals} decimals).`);
  if (transfer) {
    assumptions.push("Final balances are verified with on-chain assertions.");
  }

  const manifest = buildManifest({
    name: `${token.symbol} payment world`,
    token,
    accounts,
    transfer,
  });

  const summary = transfer
    ? `Create a local ${token.symbol} world: fund ${accounts
        .map((a) => `${a.ref} (${a.initial})`)
        .join(", ")}, then transfer ${transfer.amount} ${token.symbol} from ${transfer.from} to ${transfer.to} and verify final balances.`
    : `Create a local ${token.symbol} world and fund the named accounts.`;

  return planFromManifest("createWorld", manifest, {
    summary,
    assumptions,
    title: `Create ${token.symbol} world`,
    description: summary,
  });
}

function modifyWorldPlan(prompt: string, previous: WorldManifest): Plan {
  const params = deriveParams(previous);
  const change = parseBalanceChange(prompt);
  const newTransfer = parseTransfer(prompt);
  const assumptions: string[] = [];

  if (change) {
    const existing = params.accounts.find((a) => a.ref === change.ref);
    if (existing) existing.initial = change.amount;
    else params.accounts.push({ ref: change.ref, initial: change.amount });
    assumptions.push(`Set ${change.ref}'s initial balance to ${change.amount}.`);
  }
  if (newTransfer) {
    params.transfer = newTransfer;
    assumptions.push(
      `Updated transfer: ${newTransfer.amount} from ${newTransfer.from} to ${newTransfer.to}.`,
    );
  }
  if (!change && !newTransfer) {
    assumptions.push("No concrete change detected — re-running the previous world unchanged.");
  }

  const manifest = buildManifest({ ...params, name: previous.name });
  const changes = diffManifests(previous, manifest)
    .map((c) => `${c.path}: ${c.before} → ${c.after}`)
    .join("; ");

  return planFromManifest("modifyWorld", manifest, {
    summary: `Modify "${previous.name}" and re-run.${changes ? ` Changes: ${changes}.` : ""}`,
    assumptions,
    title: `Modify ${previous.name}`,
    description: changes || "Re-run with no changes",
  });
}

function runScenarioPlan(previous: WorldManifest | null): Plan {
  if (!previous) {
    // Nothing to replay — fall back to building the demo world.
    return { ...createWorldPlan(""), intent: "runScenario" };
  }
  return planFromManifest("runScenario", previous, {
    summary: `Replay "${previous.name}" from a clean localnet.`,
    assumptions: ["Re-runs the most recent world deterministically."],
    title: `Replay ${previous.name}`,
    description: "Re-run the last scenario",
  });
}

function controlPlan(prompt: string, running: boolean): Plan {
  const control = parseControl(prompt) ?? { kind: "stop" as const };
  const labels: Record<string, string> = {
    stop: "Stop the localnet",
    reset: "Reset the localnet to a clean state",
    snapshot: "Take an EVM snapshot",
    revert: "Revert to the last snapshot",
    resume: "Resume the previous session",
    export: "Export the current world as a manifest",
    start: "Start the localnet",
    replay: "Replay the last scenario",
  };
  const summary = labels[control.kind] ?? `Control: ${control.kind}`;
  return {
    intent: "control",
    summary,
    assumptions: running ? [] : ["Localnet is currently stopped."],
    steps: [summary],
    expectedStateChanges: [],
    assertions: [],
    safetyNotes: ["Direct localnet control — no contracts or transfers involved."],
    manifest: null,
    control,
    explanation: null,
    uiPreview: {
      title: summary,
      description: `Control action: ${control.kind}`,
      accent: control.kind === "stop" || control.kind === "reset" ? "destructive" : "default",
    },
  };
}

function explainPlan(prompt: string): Plan {
  const explanation =
    "Inspection plan (no state changes). Common local revert causes: (1) ERC20 transfer exceeding the sender's balance, (2) missing or insufficient allowance for transferFrom, (3) calling a function on a contract that hasn't been deployed yet, or (4) an assertion comparing against the wrong decimals. Review the most recent failed transaction in the Transactions panel and the assertion's expected vs. actual values in the log console.";
  return {
    intent: "explain",
    summary: "Explain the most recent failure without changing any state.",
    assumptions: ["Heuristic explanation based on common local failure modes."],
    steps: ["Inspect recent transactions", "Compare assertion expected vs. actual"],
    expectedStateChanges: [],
    assertions: [],
    safetyNotes: ["Read-only inspection — nothing is executed."],
    manifest: null,
    control: null,
    explanation,
    uiPreview: { title: "Explain failure", description: prompt.slice(0, 120), accent: "warning" },
  };
}

/** Deterministic, offline planner used for local demos and tests. */
export const mockProvider: AiProvider = {
  name: "mock",
  async generate(input: PlanInput): Promise<Plan> {
    const intent = detectIntent(input.prompt, input.previousManifest != null);
    switch (intent) {
      case "createWorld":
        return createWorldPlan(input.prompt);
      case "modifyWorld":
        return modifyWorldPlan(input.prompt, input.previousManifest!);
      case "runScenario":
        return runScenarioPlan(input.previousManifest);
      case "control":
        return controlPlan(input.prompt, input.running);
      case "explain":
        return explainPlan(input.prompt);
    }
  },
};
