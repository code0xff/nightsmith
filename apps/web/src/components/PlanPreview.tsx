import { CheckCircle2, ListChecks, Play, ShieldCheck, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cancelPlan, runCurrentPlan } from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";

const INTENT_LABELS: Record<string, string> = {
  createWorld: "create",
  modifyWorld: "modify",
  extendWorld: "extend · live",
  runScenario: "replay",
  control: "control",
  explain: "explain",
};

function Section({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      <ul className="space-y-0.5 pl-1 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="select-none text-muted-foreground">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanPreview() {
  const plan = useAppStore((s) => s.plan);
  const busy = useAppStore((s) => s.busy);
  if (!plan) return null;

  const accent = plan.uiPreview.accent;
  const badgeVariant =
    accent === "destructive" ? "destructive" : accent === "warning" ? "warning" : "default";

  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle>
          <Badge variant={badgeVariant}>{INTENT_LABELS[plan.intent] ?? plan.intent}</Badge>
          {plan.uiPreview.title}
        </CardTitle>
        <span className="text-xs text-muted-foreground">Review before running</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{plan.summary}</p>

        {plan.explanation && (
          <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-sm">
            {plan.explanation}
          </p>
        )}

        <Section
          icon={<ListChecks className="size-3" />}
          title="Steps"
          items={plan.steps}
        />
        <Section icon={<span className="text-xs">≈</span>} title="Assumptions" items={plan.assumptions} />
        <Section
          icon={<span className="text-xs">Δ</span>}
          title="Expected state changes"
          items={plan.expectedStateChanges}
        />
        <Section
          icon={<CheckCircle2 className="size-3" />}
          title="Assertions"
          items={plan.assertions}
        />
        <Section
          icon={<ShieldCheck className="size-3" />}
          title="Safety"
          items={plan.safetyNotes}
        />

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={runCurrentPlan} disabled={busy}>
            <Play />
            Run
          </Button>
          <Button variant="ghost" onClick={cancelPlan} disabled={busy}>
            <X />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
