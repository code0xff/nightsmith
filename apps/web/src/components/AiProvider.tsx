import { useState } from "react";
import { Check, Minus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { AiStatus, ProviderName } from "@nightsmith/shared";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api";
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

/** A row in the resolution list: name, availability, and whether it's active. */
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

/** Header control: shows the auto-resolved AI provider; manages the OpenAI key. */
export function AiProvider() {
  const ai = useAppStore((s) => s.ai);
  const setAi = useAppStore((s) => s.setAi);
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = async (fn: () => Promise<AiStatus>, okMsg: string) => {
    setSaving(true);
    try {
      const next = await fn();
      setAi(next);
      setApiKey("");
      toast.success(okMsg, { description: `Active provider: ${next.provider}` });
    } catch (err) {
      toast.error("AI update failed", {
        description: err instanceof ApiRequestError ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const provider = ai?.provider;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setApiKey("");
          setOpen(true);
        }}
        aria-label="AI provider settings"
        title="AI provider settings"
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

            <div className="space-y-1 border-t pt-3">
              <label htmlFor="openai-key" className="text-xs text-muted-foreground">
                OpenAI API key {ai.openaiConnected && "(a key is already saved)"}
              </label>
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                placeholder={ai.openaiConnected ? "•••••••• (enter to replace)" : "sk-…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Set a key to use OpenAI; clear it to fall back to Codex (if installed) then
                Mock. Stored at <code>~/.nightsmith/credentials.json</code> (0600), sent only
                to OpenAI, never logged.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {ai.openaiConnected ? (
                <Button
                  variant="ghost"
                  onClick={() => apply(() => api.aiDisconnect(), "OpenAI key removed")}
                  disabled={saving}
                >
                  <Minus />
                  Remove key
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Close
                </Button>
                <Button
                  onClick={() => apply(() => api.aiConnect({ openaiApiKey: apiKey }), "OpenAI key saved")}
                  disabled={saving || !apiKey.trim()}
                >
                  {saving ? "Saving…" : "Save key"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
