import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ProviderName } from "@blacksmith/shared";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api";
import { useAppStore } from "@/state/useAppStore";

function badgeFor(
  ai: ReturnType<typeof useAppStore.getState>["ai"],
): { variant: NonNullable<BadgeProps["variant"]>; label: string } {
  if (!ai) return { variant: "outline", label: "AI: …" };
  if (ai.provider === "openai") {
    return ai.openaiConnected
      ? { variant: "success", label: "AI: openai" }
      : { variant: "warning", label: "AI: openai — connect" };
  }
  if (ai.provider === "codex") {
    return ai.codexAvailable
      ? { variant: "success", label: "AI: codex" }
      : { variant: "warning", label: "AI: codex — not found" };
  }
  return { variant: "default", label: `AI: ${ai.provider}` };
}

/** Header control: shows the active AI provider and opens a connect dialog. */
export function AiProvider() {
  const ai = useAppStore((s) => s.ai);
  const setAi = useAppStore((s) => s.setAi);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderName>(ai?.provider ?? "mock");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const openDialog = () => {
    setProvider(ai?.provider ?? "mock");
    setApiKey("");
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.aiConnect({
        provider,
        ...(provider === "openai" && apiKey ? { openaiApiKey: apiKey } : {}),
      });
      setAi(next);
      setApiKey("");
      if (next.provider === "openai" && !next.openaiConnected) {
        toast.warning("Provider set to OpenAI, but no key yet", {
          description: "Add an API key to generate plans with OpenAI.",
        });
      } else {
        toast.success(`AI provider: ${next.provider}`);
      }
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't update AI provider", {
        description: err instanceof ApiRequestError ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    try {
      const next = await api.aiDisconnect();
      setAi(next);
      toast.success("Disconnected — back to the mock planner");
      setOpen(false);
    } catch (err) {
      toast.error("Disconnect failed", {
        description: err instanceof ApiRequestError ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const badge = badgeFor(ai);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Configure AI provider"
        title="Configure AI provider"
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <Badge variant={badge.variant}>
          <Sparkles className="size-3" />
          {badge.label}
        </Badge>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="AI provider"
        description="Choose how prompts become plans. Stored locally, never shared."
      >
        <div className="space-y-3">
          {ai?.envManaged && (
            <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
              Provider is pinned by <code>BLACKSMITH_AI_PROVIDER</code> (currently{" "}
              <span className="font-medium">{ai.provider}</span>). Unset it to change here.
            </p>
          )}
          <div className="space-y-1.5">
            {(
              [
                { id: "mock", label: "Mock", desc: "Deterministic, offline. No key, no network." },
                { id: "openai", label: "OpenAI (ChatGPT)", desc: "Uses the OpenAI API. Requires an API key (sk-…)." },
                {
                  id: "codex",
                  label: "Codex CLI",
                  desc: ai?.codexAvailable
                    ? "Uses your local Codex login (ChatGPT) — no API key needed."
                    : "Codex CLI not detected on PATH. Install it to use this option.",
                  disabled: !ai?.codexAvailable,
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                  "disabled" in opt && opt.disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  checked={provider === opt.id}
                  disabled={("disabled" in opt && opt.disabled) || ai?.envManaged}
                  onChange={() => setProvider(opt.id)}
                  className="mt-0.5 accent-foreground"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>

          {provider === "openai" && (
            <div className="space-y-1">
              <label htmlFor="openai-key" className="text-xs text-muted-foreground">
                OpenAI API key {ai?.openaiConnected && "(a key is already saved)"}
              </label>
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                placeholder={ai?.openaiConnected ? "•••••••• (leave blank to keep)" : "sk-…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Stored at <code>~/.blacksmith/credentials.json</code> (0600). Sent only to
                OpenAI when generating a plan — never to anyone else, never logged.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {ai?.openaiConnected ? (
              <Button variant="ghost" onClick={disconnect} disabled={saving}>
                Disconnect
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
