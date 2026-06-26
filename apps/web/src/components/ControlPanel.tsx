import { Camera, Download, Play, Power, RotateCcw, Square, Undo2 } from "lucide-react";
import { CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  exportLatest,
  localnetAction,
  replayLatest,
} from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";

/** Direct localnet controls. Lives in the Localnet card footer. */
export function ControlPanel() {
  const running = useAppStore((s) => s.world.localnet.status === "running");
  const busy = useAppStore((s) => s.busy);

  return (
    <CardFooter className="flex-wrap gap-1.5">
      {running ? (
        <Button variant="destructive" onClick={() => localnetAction("stop")} disabled={busy}>
          <Square />
          Stop
        </Button>
      ) : (
        <Button onClick={() => localnetAction("start")} disabled={busy}>
          <Power />
          Start
        </Button>
      )}
      <Button variant="destructive" onClick={() => localnetAction("reset")} disabled={busy}>
        <RotateCcw />
        Reset
      </Button>
      <Button
        variant="outline"
        onClick={() => localnetAction("snapshot")}
        disabled={busy || !running}
      >
        <Camera />
        Snapshot
      </Button>
      <Button
        variant="outline"
        onClick={() => localnetAction("revert")}
        disabled={busy || !running}
      >
        <Undo2 />
        Revert
      </Button>
      <Button variant="secondary" onClick={replayLatest} disabled={busy}>
        <Play />
        Replay
      </Button>
      <Button variant="ghost" onClick={exportLatest}>
        <Download />
        Export
      </Button>
    </CardFooter>
  );
}
