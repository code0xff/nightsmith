import type { ExecutionReport, WorldManifest } from "@blacksmith/shared";

/** Render an execution report as a human-readable Markdown document. */
export function reportToMarkdown(
  report: ExecutionReport,
  manifest?: WorldManifest,
): string {
  const lines: string[] = [];
  const passed = report.assertions.filter((a) => a.passed).length;

  lines.push(`# ${report.manifestName}`);
  lines.push("");
  lines.push(`- **Status:** ${report.status}`);
  lines.push(`- **Session:** ${report.sessionId}`);
  lines.push(`- **Started:** ${report.startedAt}`);
  lines.push(`- **Finished:** ${report.finishedAt}`);
  if (manifest) {
    lines.push(`- **Network:** anvil-local (chainId ${manifest.network.chainId})`);
  }
  if (report.error) lines.push(`- **Error:** ${report.error}`);
  lines.push("");

  lines.push("## Steps");
  for (const step of report.steps) {
    const mark = step.status === "ok" ? "✓" : step.status === "skipped" ? "–" : "✗";
    lines.push(`- ${mark} ${step.label}${step.detail ? ` — ${step.detail}` : ""}`);
  }
  lines.push("");

  lines.push(`## Assertions (${passed}/${report.assertions.length} passed)`);
  for (const a of report.assertions) {
    const mark = a.passed ? "✓" : "✗";
    const detail = a.passed ? "" : ` (expected ${a.expected}, got ${a.actual})`;
    lines.push(`- ${mark} ${a.description}${detail}`);
  }
  lines.push("");

  const tokens = report.finalState.tokenBalances;
  if (tokens.length > 0) {
    lines.push("## Final token balances");
    for (const t of tokens) lines.push(`- ${t.account}: ${t.balance} ${t.symbol}`);
    lines.push("");
  }

  return lines.join("\n");
}
