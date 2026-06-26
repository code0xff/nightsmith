import { useEffect } from "react";
import { Hammer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AiProvider } from "@/components/AiProvider";
import { Dashboard } from "@/pages/Dashboard";
import { useWebSocket } from "@/lib/useWebSocket";
import { api } from "@/lib/api";
import { useAppStore } from "@/state/useAppStore";

function ConnectionBadge() {
  const connected = useAppStore((s) => s.connected);
  return (
    <Badge variant={connected ? "success" : "destructive"} title="Server connection">
      <span
        className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-destructive"}`}
      />
      {connected ? "live" : "offline"}
    </Badge>
  );
}

export function App() {
  useWebSocket();
  const setAi = useAppStore((s) => s.setAi);

  useEffect(() => {
    let active = true;
    api
      .getAi()
      .then((ai) => {
        if (active) setAi(ai);
      })
      .catch(() => {
        // Server may still be starting; the badge stays in its loading state.
      });
    return () => {
      active = false;
    };
  }, [setAi]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-baseline gap-2">
          <Hammer className="size-4 translate-y-0.5 text-foreground" />
          <span className="text-sm font-medium tracking-tight">Blacksmith</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            local blockchain cockpit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AiProvider />
          <ConnectionBadge />
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden p-3">
        <Dashboard />
      </main>
    </div>
  );
}
