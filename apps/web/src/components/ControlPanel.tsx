import { Camera, Download, Play, Power, RotateCcw, Square, Undo2 } from "lucide-react";
import { CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportLatest, localnetAction, replayLatest } from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";

/**
 * Direct localnet controls — a tidy 2×3 grid grouped by row: lifecycle
 * (Start/Stop + Reset), snapshot (Snapshot/Revert), session (Replay/Export).
 */
export function ControlPanel() {
  const running = useAppStore((s) => s.world.localnet.status === "running");
  const busy = useAppStore((s) => s.busy);

  return (
    <CardFooter className="grid grid-cols-2 gap-2 p-2.5">
      {running ? (
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => localnetAction("stop")}
          disabled={busy}
        >
          <Square />
          Stop
        </Button>
      ) : (
        <Button className="w-full" onClick={() => localnetAction("start")} disabled={busy}>
          <Power />
          Start
        </Button>
      )}
      <Button
        variant="destructive"
        className="w-full"
        onClick={() => localnetAction("reset")}
        disabled={busy}
      >
        <RotateCcw />
        Reset
      </Button>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => localnetAction("snapshot")}
        disabled={busy || !running}
      >
        <Camera />
        Snapshot
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => localnetAction("revert")}
        disabled={busy || !running}
      >
        <Undo2 />
        Revert
      </Button>

      <Button
        variant="secondary"
        className="w-full"
        onClick={replayLatest}
        disabled={busy}
      >
        <Play />
        Replay
      </Button>
      <Button variant="ghost" className="w-full" onClick={exportLatest}>
        <Download />
        Export
      </Button>
    </CardFooter>
  );
}
