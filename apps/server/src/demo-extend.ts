import { Plan } from "@nightsmith/shared";
import { mockProvider } from "./ai/providers/mock.js";
import { runPlan } from "./executor/runPlan.js";
import { Runtime } from "./runtime/runtime.js";
import { getSession } from "./sessions/store.js";

/**
 * Headless end-to-end demo for INCREMENTAL execution: create a world, then
 * append a follow-up transfer via an extendWorld plan and prove it was applied
 * on top of the LIVE Anvil — no restart (block number keeps climbing), the
 * deployed contract keeps its address, and balances reflect both runs.
 *
 * Create: Alice 1000, Bob 100, Alice -> Bob 10  =>  Alice 990, Bob 110
 * Extend: Alice -> Bob 25                        =>  Alice 965, Bob 135
 * Run with `pnpm --filter @nightsmith/server demo:extend`.
 */
const CREATE_PROMPT =
  "Create a local USDC payment test world. Alice should have 1000 USDC, Bob should have 100 USDC, then Alice sends Bob 10 USDC and verify balances.";
const EXTEND_PROMPT = "Then Alice sends Bob 25 USDC.";

const runtime = new Runtime();
runtime.bus.subscribe((e) => {
  if (e.type === "log") process.stdout.write(`  [${e.entry.level}] ${e.entry.message}\n`);
});

const balanceOf = (ref: string): string | undefined =>
  runtime.getState().tokenBalances.find((t) => t.account === ref)?.balance;

function fail(msg: string): never {
  process.stdout.write(`\n✗ ${msg}\n`);
  process.exit(1);
}

try {
  // ── 1. Create the world ──────────────────────────────────────────────────
  process.stdout.write(`Prompt: ${CREATE_PROMPT}\n\nExecuting create…\n`);
  const createPlan = Plan.parse(
    await mockProvider.generate({
      prompt: CREATE_PROMPT,
      previousManifest: null,
      running: false,
      artifacts: [],
    }),
  );
  const created = await runPlan(runtime, createPlan);
  if (created.report?.status !== "completed") fail("create did not complete");
  const sessionId = created.sessionId!;
  const addressBefore = runtime.getState().contracts[0]?.address;
  const blockBefore = runtime.getState().localnet.blockNumber ?? 0;
  process.stdout.write(
    `\nAfter create: session=${sessionId} contract=${addressBefore} block=${blockBefore} ` +
      `Alice=${balanceOf("Alice")} Bob=${balanceOf("Bob")}\n`,
  );

  // ── 2. Extend the live world ───────────────────────────────────────────────
  process.stdout.write(`\nPrompt: ${EXTEND_PROMPT}\n\nPlanning extend…\n`);
  const extendPlan = Plan.parse(
    await mockProvider.generate({
      prompt: EXTEND_PROMPT,
      previousManifest: getSession(sessionId).manifest,
      running: true,
      artifacts: [],
    }),
  );
  process.stdout.write(`Plan intent: ${extendPlan.intent} — ${extendPlan.summary}\n`);
  if (extendPlan.intent !== "extendWorld") fail(`expected extendWorld, got ${extendPlan.intent}`);

  process.stdout.write("\nExecuting extend…\n");
  const extended = await runPlan(runtime, extendPlan, { baseSessionId: sessionId });
  if (extended.report?.status !== "completed") fail("extend did not complete");

  const addressAfter = runtime.getState().contracts[0]?.address;
  const blockAfter = runtime.getState().localnet.blockNumber ?? 0;

  // ── 3. Assert incremental invariants ───────────────────────────────────────
  process.stdout.write("\n=== RESULT ===\n");
  process.stdout.write(`same session:      ${extended.sessionId === sessionId}\n`);
  process.stdout.write(`contract address:  ${addressBefore} -> ${addressAfter}\n`);
  process.stdout.write(`block number:      ${blockBefore} -> ${blockAfter}\n`);
  process.stdout.write(`Alice=${balanceOf("Alice")} Bob=${balanceOf("Bob")}\n`);

  if (extended.sessionId !== sessionId) fail("extend created a new session instead of reusing the live one");
  if (!addressAfter || addressAfter !== addressBefore) fail("contract was redeployed (address changed) — Anvil was reset");
  if (!(blockAfter > blockBefore)) fail("block number did not advance — actions were not applied incrementally");
  if (balanceOf("Bob") !== "135") fail(`Bob should hold 135 USDC, got ${balanceOf("Bob")}`);
  if (balanceOf("Alice") !== "965") fail(`Alice should hold 965 USDC, got ${balanceOf("Alice")}`);

  process.stdout.write("\n✓ Incremental extend applied on the live world (no restart).\n");
  process.exit(0);
} finally {
  await runtime.stopLocalnet().catch(() => {});
}
