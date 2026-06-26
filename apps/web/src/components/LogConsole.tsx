import { useEffect, useRef } from "react";
import { Terminal, Trash2 } from "lucide-react";
import type { LogLevel } from "@nightsmith/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ALL_LEVELS, useAppStore } from "@/state/useAppStore";
import { cn, formatTime } from "@/lib/utils";

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

export function LogConsole() {
  const logs = useAppStore((s) => s.logs);
  const levelFilter = useAppStore((s) => s.levelFilter);
  const autoScroll = useAppStore((s) => s.autoScroll);
  const setAutoScroll = useAppStore((s) => s.setAutoScroll);
  const toggleLevel = useAppStore((s) => s.toggleLevel);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = logs.filter((l) => levelFilter.has(l.level));

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length, autoScroll]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>
          <Terminal className="size-3.5 text-muted-foreground" />
          Logs
        </CardTitle>
        <div className="flex items-center gap-1">
          {ALL_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={levelFilter.has(level)}
              onClick={() => toggleLevel(level)}
              className={cn(
                "rounded px-1 py-0.5 text-[0.625rem] uppercase tracking-wide transition-colors",
                levelFilter.has(level)
                  ? LEVEL_CLASS[level]
                  : "text-muted-foreground/40 line-through",
              )}
            >
              {level}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="size-3 accent-foreground"
            />
            auto
          </label>
          <Button variant="ghost" size="icon" aria-label="Clear logs" onClick={clearLogs}>
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto scrollbar-thin bg-background/40 p-0">
        {visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            No logs. Generate and run a plan to see execution output here.
          </p>
        ) : (
          <div className="p-2 font-mono text-xs leading-[1.35]">
            {visible.map((l) => (
              <div key={l.id} className="flex gap-2 whitespace-pre-wrap break-words">
                <span className="shrink-0 text-muted-foreground/70">{formatTime(l.ts)}</span>
                {l.scope && <span className="shrink-0 text-muted-foreground/50">{l.scope}</span>}
                <span className={LEVEL_CLASS[l.level]}>{l.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
