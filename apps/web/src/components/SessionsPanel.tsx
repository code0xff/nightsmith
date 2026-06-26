import { useCallback, useEffect, useState } from "react";
import { Download, History, Play, RefreshCw, Trash2 } from "lucide-react";
import type { SessionSummary } from "@blacksmith/shared";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { exportSession, replaySession } from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";
import { formatTime } from "@/lib/utils";

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const execution = useAppStore((s) => s.world.execution);

  const refresh = useCallback(async () => {
    try {
      const res = await api.sessions();
      setSessions(res.sessions);
    } catch {
      // Server may be momentarily unavailable; keep last known list.
    }
  }, []);

  // Refresh on mount and whenever an execution settles.
  useEffect(() => {
    if (execution === "completed" || execution === "failed" || execution === "idle") {
      refresh();
    }
  }, [execution, refresh]);

  const remove = async (id: string) => {
    try {
      await api.deleteSession(id);
      toast.success("Session deleted", { description: id });
      refresh();
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle>
          <History className="size-3.5 text-muted-foreground" />
          Sessions
        </CardTitle>
        <Button variant="ghost" size="icon" aria-label="Refresh sessions" onClick={refresh}>
          <RefreshCw />
        </Button>
      </CardHeader>
      <CardContent className="min-h-0 space-y-1.5 overflow-y-auto scrollbar-thin">
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No saved sessions yet. Running a plan saves a replayable session.
          </p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  {s.lastRunStatus !== "none" && (
                    <Badge
                      variant={s.lastRunStatus === "completed" ? "success" : "destructive"}
                    >
                      {s.lastRunStatus}
                    </Badge>
                  )}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatTime(s.updatedAt)} · {s.id}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Replay ${s.name}`}
                  onClick={() => replaySession(s.id)}
                >
                  <Play />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Export ${s.name}`}
                  onClick={() => exportSession(s.id)}
                >
                  <Download />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => remove(s.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
