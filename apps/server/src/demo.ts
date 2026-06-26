import { Plan } from "@nightsmith/shared";
import { mockProvider } from "./ai/providers/mock.js";
import { runPlan } from "./executor/runPlan.js";
import { Runtime } from "./runtime/runtime.js";

/**
 * Headless end-to-end demo: prompt -> plan -> execute, with no browser. Proves
 * the first demo scenario (Bob ends with 110 USDC). Run with `pnpm demo`.
 */
const DEMO_PROMPT =
  "Create a local USDC payment test world. Alice should have 1000 USDC, Bob should have 100 USDC, then Alice sends Bob 10 USDC and the final balance should be verified.";

const runtime = new Runtime();
runtime.bus.subscribe((e) => {
  if (e.type === "log") process.stdout.write(`  [${e.entry.level}] ${e.entry.message}\n`);
});

process.stdout.write(`Prompt: ${DEMO_PROMPT}\n\n`);
// Force the deterministic mock planner so the demo is reproducible regardless
// of whether an OpenAI key or the Codex CLI is available on this machine.
const plan = Plan.parse(
  await mockProvider.generate({
    prompt: DEMO_PROMPT,
    previousManifest: null,
    running: false,
    artifacts: [],
  }),
);

process.stdout.write(`Plan (deterministic mock): ${plan.summary}\n`);
for (const step of plan.steps) process.stdout.write(`  • ${step}\n`);
process.stdout.write("\nExecuting…\n");

try {
  const result = await runPlan(runtime, plan);
  const report = result.report;
  process.stdout.write("\n=== RESULT ===\n");
  process.stdout.write(`session: ${result.sessionId}\n`);
  process.stdout.write(`status: ${report?.status}\n`);
  for (const a of report?.assertions ?? []) {
    process.stdout.write(
      `  ${a.passed ? "✓" : "✗"} ${a.description} (expected ${a.expected}, got ${a.actual})\n`,
    );
  }
  process.exit(report?.status === "completed" ? 0 : 1);
} finally {
  await runtime.stopLocalnet().catch(() => {});
}
