import { Download, Eraser, Play, Power, Square } from "lucide-react";
import { CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportLatest, localnetAction, replayLatest } from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";

/**
 * Direct localnet controls: a full-width lifecycle toggle (Start/Stop) over a
 * 2-column row of session controls (Replay/Export), then a full-width Clear
 * that wipes the stopped world back to a blank cockpit.
 */
export function ControlPanel() {
  const running = useAppStore((s) => s.world.localnet.status === "running");
  const busy = useAppStore((s) => s.busy);

  return (
    <CardFooter className="grid grid-cols-2 gap-2 p-2.5">
      {running ? (
        <Button
          variant="destructive"
          className="col-span-2 w-full"
          onClick={() => localnetAction("stop")}
          disabled={busy}
        >
          <Square />
          Stop
        </Button>
      ) : (
        <Button
          className="col-span-2 w-full"
          onClick={() => localnetAction("start")}
          disabled={busy}
        >
          <Power />
          Start
        </Button>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={replayLatest}
        disabled={busy}
      >
        <Play />
        Replay
      </Button>
      <Button variant="ghost" className="w-full" onClick={exportLatest} disabled={busy}>
        <Download />
        Export
      </Button>

      <Button
        variant="ghost"
        className="col-span-2 w-full text-destructive hover:text-destructive"
        onClick={() => localnetAction("clear")}
        disabled={busy || running}
        title="Clear the stopped world (World State, Transactions, logs)"
      >
        <Eraser />
        Clear
      </Button>
    </CardFooter>
  );
}
