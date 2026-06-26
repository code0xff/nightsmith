import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { BadgeProps } from "@/components/ui/badge";
import type { ProviderName } from "@nightsmith/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useAppStore } from "@/state/useAppStore";

const BADGE: Record<ProviderName, NonNullable<BadgeProps["variant"]>> = {
  openai: "success",
  codex: "default",
  mock: "outline",
};

const LABEL: Record<ProviderName, string> = {
  openai: "OpenAI",
  codex: "Codex",
  mock: "Mock",
};

function ResolutionRow({
  name,
  available,
  detail,
  active,
}: {
  name: string;
  available: boolean;
  detail: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
      <span className="flex items-center gap-1.5">
        {available ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <X className="size-3.5 text-muted-foreground/60" />
        )}
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
      {active && <Badge variant="success">active</Badge>}
    </div>
  );
}

/** Header control: shows the auto-resolved AI provider (read-only). */
export function AiProvider() {
  const ai = useAppStore((s) => s.ai);
  const [open, setOpen] = useState(false);
  const provider = ai?.provider;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="AI provider status"
        title="AI provider status"
        className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Badge variant={provider ? BADGE[provider] : "outline"}>
          <Sparkles className="size-3" />
          {provider ? `AI · ${LABEL[provider]}` : "AI · …"}
        </Badge>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="AI provider"
        description="Chosen automatically by availability — no manual selection."
      >
        {!ai ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <ResolutionRow
                name="OpenAI"
                available={ai.openaiConnected}
                detail={ai.openaiConnected ? "key set" : "no key"}
                active={ai.provider === "openai"}
              />
              <ResolutionRow
                name="Codex CLI"
                available={ai.codexAvailable}
                detail={ai.codexAvailable ? "installed" : "not found"}
                active={ai.provider === "codex"}
              />
              <ResolutionRow
                name="Mock"
                available
                detail="always available"
                active={ai.provider === "mock"}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              To use OpenAI, set <code>OPENAI_API_KEY</code> in the environment (e.g. your{" "}
              <code>.env</code>) and restart the server. The key is read from the environment
              only — Nightsmith never stores it. Otherwise it falls back to Codex (if installed),
              then the offline Mock planner.
            </p>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
