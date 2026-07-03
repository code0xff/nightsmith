import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Download, History, Play, RefreshCw, Trash2, Upload } from "lucide-react";
import type { SessionSummary } from "@nightsmith/shared";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { exportSession, importManifestFile, replaySession } from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";
import { cn, formatTime } from "@/lib/utils";

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ids whose full prompt is expanded (collapsed to 2 lines by default).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const execution = useAppStore((s) => s.world.execution);
  const mounted = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.sessions();
      if (!mounted.current) return;
      setSessions(res.sessions);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
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

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-imported
    if (!file) return;
    await importManifestFile(file);
    refresh();
  };

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle>
          <History className="size-3.5 text-muted-foreground" />
          Sessions
        </CardTitle>
        <div className="flex items-center gap-0.5">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onImport}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Import a manifest file"
            title="Import a manifest file"
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Refresh sessions" onClick={refresh}>
            <RefreshCw />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 space-y-1.5 overflow-y-auto scrollbar-thin">
        {loading && sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Loading sessions…</p>
        ) : error ? (
          <p className="text-xs text-destructive">
            Couldn’t load sessions: {error}
          </p>
        ) : sessions.length === 0 ? (
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
                {s.prompt && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(s.id)}
                    aria-expanded={expanded.has(s.id)}
                    aria-label={expanded.has(s.id) ? "Collapse prompt" : "Expand prompt"}
                    className="mt-0.5 flex w-full items-start gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span
                      className={cn(
                        expanded.has(s.id) ? "whitespace-pre-wrap break-words" : "line-clamp-2",
                      )}
                    >
                      “{s.prompt}”
                    </span>
                    <ChevronDown
                      className={cn(
                        "mt-0.5 size-3 shrink-0 transition-transform",
                        expanded.has(s.id) && "rotate-180",
                      )}
                    />
                  </button>
                )}
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
