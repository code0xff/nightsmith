import { toast } from "sonner";
import type { LocalnetAction } from "@nightsmith/shared";
import { ApiRequestError, api } from "./api";
import { useAppStore } from "@/state/useAppStore";

/** Control/localnet actions that invalidate the live-session cursor. */
const INVALIDATING_CONTROLS = new Set(["stop", "reset", "revert"]);

function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.details?.length ? `${err.message}: ${err.details.join("; ")}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Generate a reviewable plan from a prompt (does not execute). */
export async function submitPrompt(prompt: string): Promise<void> {
  const store = useAppStore.getState();
  if (!prompt.trim() || store.busy) return;
  store.setBusy(true);
  try {
    // Pass the live session so the planner sees the previous manifest and can
    // plan a modify/extend rather than a fresh world.
    const { plan, planId, warnings } = await api.prompt(prompt, store.sessionId ?? undefined);
    store.setPlan(plan, planId, warnings);
    toast.success("Plan ready for review", {
      description: warnings.length ? `${plan.summary} — ${warnings.length} warning(s)` : plan.summary,
    });
  } catch (err) {
    toast.error("Planning failed", { description: describeError(err) });
  } finally {
    store.setBusy(false);
  }
}

/** Execute the currently previewed plan after user confirmation. */
export async function runCurrentPlan(): Promise<void> {
  const store = useAppStore.getState();
  const { plan, planId } = store;
  if (!plan || store.busy) return;
  store.setBusy(true);
  toast("Execution started", { description: plan.summary });
  try {
    const res = await api.execute(plan, planId ?? undefined, store.sessionId ?? undefined);
    // Track the live session so the next prompt/extend targets this world. A
    // control action that tears down or rewinds the world (stop/reset/revert)
    // returns no session and invalidates the live cursor — clear it so the next
    // extend doesn't target a dead world.
    if (res.sessionId) store.setSessionId(res.sessionId);
    else if (plan.intent === "control" && INVALIDATING_CONTROLS.has(plan.control?.kind ?? "")) {
      store.setSessionId(null);
    }
    const report = res.report;
    if (report) {
      const passed = report.assertions.filter((a) => a.passed).length;
      const total = report.assertions.length;
      if (report.status === "completed") {
        toast.success("Execution completed", {
          description: total ? `${passed}/${total} assertions passed` : undefined,
        });
        store.clearPrompt(); // world built — clear the prompt for the next one
      } else {
        toast.error("Execution failed", {
          description: report.error ?? `${passed}/${total} assertions passed`,
        });
      }
    } else {
      toast.success("Done", { description: plan.summary });
    }
    store.setPlan(null);
  } catch (err) {
    toast.error("Execution failed", { description: describeError(err) });
  } finally {
    store.setBusy(false);
  }
}

export function cancelPlan(): void {
  useAppStore.getState().setPlan(null);
}

const ACTION_LABELS: Record<LocalnetAction, string> = {
  start: "Localnet started",
  stop: "Localnet stopped",
  reset: "Localnet reset",
  snapshot: "Snapshot taken",
  revert: "Reverted to snapshot",
};

/** Run a direct localnet control action. */
export async function localnetAction(
  action: LocalnetAction,
  snapshotId?: string,
): Promise<void> {
  try {
    const res = await api.localnet(action, snapshotId);
    // stop/reset/revert leave no live world matching the tracked session.
    if (INVALIDATING_CONTROLS.has(action)) useAppStore.getState().setSessionId(null);
    toast.success(ACTION_LABELS[action], {
      description: action === "snapshot" ? res.snapshotId : undefined,
    });
  } catch (err) {
    toast.error(`Action "${action}" failed`, { description: describeError(err) });
  }
}

/** Replay a saved session by loading its manifest and re-running it. */
export async function replaySession(id: string): Promise<void> {
  const store = useAppStore.getState();
  if (store.busy) return;
  store.setBusy(true);
  toast("Replaying session", { description: id });
  try {
    const detail = await api.session(id);
    const res = await api.execute({
      intent: "runScenario",
      summary: `Replay ${detail.manifest.name}`,
      assumptions: [],
      steps: [],
      expectedStateChanges: [],
      assertions: [],
      safetyNotes: [],
      manifest: detail.manifest,
      control: null,
      explanation: null,
      uiPreview: { title: "Replay", description: detail.manifest.name, accent: "default" },
    });
    // The replayed manifest is now the live world — track it so a follow-up
    // extends this session, not a stale one.
    if (res.sessionId) store.setSessionId(res.sessionId);
    if (res.report?.status === "completed") toast.success("Replay completed");
    else toast.error("Replay finished with failures");
  } catch (err) {
    toast.error("Replay failed", { description: describeError(err) });
  } finally {
    store.setBusy(false);
  }
}

/** Replay the most recent session (used by the control panel's Replay button). */
export async function replayLatest(): Promise<void> {
  const { sessions } = await api.sessions();
  if (sessions.length === 0) {
    toast.info("No session to replay yet");
    return;
  }
  await replaySession(sessions[0]!.id);
}

/** Export the most recent session (used by the control panel's Export button). */
export async function exportLatest(): Promise<void> {
  const { sessions } = await api.sessions();
  if (sessions.length === 0) {
    toast.info("No session to export yet");
    return;
  }
  await exportSession(sessions[0]!.id);
}

/** Export a session manifest as a downloadable JSON file. */
export async function exportSession(id: string): Promise<void> {
  try {
    const detail = await api.session(id);
    const blob = new Blob([JSON.stringify(detail.manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Manifest exported", { description: `${id}.manifest.json` });
  } catch (err) {
    toast.error("Export failed", { description: describeError(err) });
  }
}
