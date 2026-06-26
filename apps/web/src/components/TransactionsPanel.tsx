import { ArrowLeftRight, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { useAppStore } from "@/state/useAppStore";
import { formatTime, truncateHex } from "@/lib/utils";

export function TransactionsPanel() {
  const transactions = useAppStore((s) => s.world.transactions);
  const scenario = useAppStore((s) => s.world.scenario);

  return (
    <Card className="flex min-h-0 w-full flex-col">
      <CardHeader>
        <CardTitle>
          <ArrowLeftRight className="size-3.5 text-muted-foreground" />
          Transactions & scenario
        </CardTitle>
        {scenario && (
          <Badge
            variant={
              scenario.status === "passed"
                ? "success"
                : scenario.status === "failed"
                  ? "destructive"
                  : "running"
            }
          >
            {scenario.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="min-h-0 space-y-3 overflow-y-auto scrollbar-thin">
        {scenario && scenario.assertions.length > 0 && (
          <ul className="space-y-1">
            {scenario.assertions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm">
                {a.passed ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                )}
                <span>
                  {a.description}
                  {!a.passed && a.expected !== undefined && (
                    <span className="text-muted-foreground">
                      {" "}
                      (expected {a.expected}, got {a.actual})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {transactions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="font-normal">time</th>
                <th className="font-normal">fn</th>
                <th className="font-normal">status</th>
                <th className="font-normal">tx</th>
                <th className="text-right font-normal">gas</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.hash} className="border-t">
                  <td className="py-1 font-mono text-xs text-muted-foreground">
                    {formatTime(tx.ts)}
                  </td>
                  <td className="py-1 pr-2">{tx.fn ?? "—"}</td>
                  <td className="py-1">
                    <span
                      className={
                        tx.status === "success" ? "text-success" : "text-destructive"
                      }
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-1">
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-xs" title={tx.hash}>
                        {truncateHex(tx.hash)}
                      </span>
                      <CopyButton value={tx.hash} label="Copy tx hash" />
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono text-xs text-muted-foreground">
                    {tx.gasUsed ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
