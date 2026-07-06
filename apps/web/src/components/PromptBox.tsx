import { useEffect, useState } from "react";
import { Loader2, SendHorizontal, Sparkles, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PROMPT_LENGTH } from "@nightsmith/shared";
import { cancelPlanning, submitPrompt } from "@/lib/actions";
import { useAppStore } from "@/state/useAppStore";

const EXAMPLES = [
  "Create a local USDC payment test world with Alice and Bob",
  "Replay the last scenario",
  "Explain why the last transaction reverted",
];

export function PromptBox() {
  const [value, setValue] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const busy = useAppStore((s) => s.busy);
  const planning = useAppStore((s) => s.planning);
  const promptResetSignal = useAppStore((s) => s.promptResetSignal);

  // Clear the box once an execution completes successfully (signal bumps).
  useEffect(() => {
    if (promptResetSignal > 0) setValue("");
  }, [promptResetSignal]);

  // Tick an elapsed-seconds counter while planning — a live "still working"
  // signal so a long reasoning-model plan doesn't look hung.
  useEffect(() => {
    if (!planning) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [planning]);

  const submit = () => {
    submitPrompt(value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle>
          <Sparkles className="size-3.5 text-muted-foreground" />
          Prompt
        </CardTitle>
        <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          aria-label="Describe the world you want to test"
          placeholder="Create a local USDC payment test world. Alice should have 1000 USDC, Bob should have 100 USDC, then Alice sends Bob 10 USDC and the final balance should be verified."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          maxLength={MAX_PROMPT_LENGTH}
          disabled={busy}
          className="resize-y font-sans disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setValue(ex)}
              disabled={busy}
              className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
        {planning && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Generating a plan… {elapsed}s — a reasoning model can take a while; you can Stop anytime.
          </p>
        )}
        <div className="flex justify-end">
          {planning ? (
            <Button variant="destructive" onClick={cancelPlanning}>
              <Square />
              Stop ({elapsed}s)
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy || !value.trim()}>
              <SendHorizontal />
              {busy ? "Working…" : "Generate plan"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
