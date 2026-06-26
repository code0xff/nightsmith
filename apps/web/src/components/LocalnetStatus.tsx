import { Activity } from "lucide-react";
import type { LocalnetStatus as Status } from "@blacksmith/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { useAppStore } from "@/state/useAppStore";
import { ControlPanel } from "@/components/ControlPanel";

const STATUS_VARIANT: Record<Status, NonNullable<BadgeProps["variant"]>> = {
  running: "success",
  starting: "warning",
  error: "destructive",
  stopped: "outline",
};

function Row({
  label,
  value,
  copy,
}: {
  label: string;
  value?: React.ReactNode;
  copy?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 font-mono text-xs">
        {value ?? <span className="text-muted-foreground">—</span>}
        {copy && <CopyButton value={copy} label={`Copy ${label}`} />}
      </span>
    </div>
  );
}

export function LocalnetStatus() {
  const localnet = useAppStore((s) => s.world.localnet);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Activity className="size-3.5 text-muted-foreground" />
          Localnet
        </CardTitle>
        <Badge variant={STATUS_VARIANT[localnet.status]}>{localnet.status}</Badge>
      </CardHeader>
      <CardContent className="divide-y">
        <Row label="Chain ID" value={localnet.chainId} />
        <Row
          label="RPC URL"
          value={localnet.rpcUrl}
          copy={localnet.rpcUrl}
        />
        <Row label="Block" value={localnet.blockNumber} />
        <Row label="Fork" value={localnet.forked ? "yes" : "no"} />
        <Row label="Session" value={localnet.sessionName} />
      </CardContent>
      <ControlPanel />
    </Card>
  );
}
