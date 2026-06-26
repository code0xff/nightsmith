import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api";
import { useAppStore } from "@/state/useAppStore";

/**
 * Shown only when Anvil is missing. Asks for explicit consent, shows the exact
 * command, then runs the official installer server-side (output streams to the
 * log console). Renders nothing once Anvil is present.
 */
export function AnvilInstall() {
  const anvil = useAppStore((s) => s.anvil);
  const setAnvil = useAppStore((s) => s.setAnvil);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const setBusy = useAppStore((s) => s.setBusy);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!anvil || anvil.installed) return null;

  const install = async () => {
    setInstalling(true);
    setBusy(true); // block other controls while Foundry installs
    toast("Installing Foundry…", { description: "Watch the log console for progress." });
    try {
      const next = await api.installAnvil(anvil.installToken);
      if (!mounted.current) return;
      setAnvil(next);
      if (next.installed) {
        toast.success("Anvil installed");
        setOpen(false);
      } else {
        toast.error("Install finished but Anvil still not found");
      }
    } catch (err) {
      if (!mounted.current) return;
      toast.error("Install failed", {
        description: err instanceof ApiRequestError ? err.message : String(err),
      });
    } finally {
      if (mounted.current) setInstalling(false);
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-warning/40">
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Anvil not found</p>
              <p className="text-xs text-muted-foreground">
                Nightsmith needs Foundry’s Anvil to run a localnet.
              </p>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => setOpen(true)}
            disabled={!anvil.installable}
            title={anvil.installable ? undefined : "Automatic install is macOS/Linux only"}
          >
            <Download />
            {anvil.installable ? "Install Foundry" : "Install manually"}
          </Button>
          {!anvil.installable && (
            <p className="text-xs text-muted-foreground">
              See{" "}
              <a
                className="underline"
                href="https://book.getfoundry.sh/getting-started/installation"
                target="_blank"
                rel="noreferrer"
              >
                getfoundry.sh
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onClose={() => !installing && setOpen(false)}
        title="Install Foundry?"
        description="This installs Anvil (and forge/cast) via the official installer."
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The following command will run on this machine. Output streams to the log console.
          </p>
          <pre className="overflow-x-auto rounded-md border bg-background/60 p-2 font-mono text-xs">
            {anvil.installCommand}
            {"\n"}~/.foundry/bin/foundryup
          </pre>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={installing}>
              Cancel
            </Button>
            <Button onClick={install} disabled={installing}>
              {installing ? "Installing…" : "Install"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
