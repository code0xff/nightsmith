import { create } from "zustand";
import {
  emptyWorldState,
  type LogEntry,
  type LogLevel,
  type Plan,
  type ServerEvent,
  type WorldState,
} from "@blacksmith/shared";

const MAX_LOGS = 2000;
const ALL_LEVELS: LogLevel[] = ["debug", "info", "success", "warning", "error"];

interface AppState {
  connected: boolean;
  world: WorldState;
  logs: LogEntry[];
  plan: Plan | null;
  planId: string | null;
  busy: boolean;
  autoScroll: boolean;
  levelFilter: Set<LogLevel>;

  setConnected: (v: boolean) => void;
  applyEvent: (event: ServerEvent) => void;
  resetSnapshot: () => void;
  setPlan: (plan: Plan | null, planId?: string | null) => void;
  setBusy: (v: boolean) => void;
  setAutoScroll: (v: boolean) => void;
  toggleLevel: (level: LogLevel) => void;
  clearLogs: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  connected: false,
  world: emptyWorldState(),
  logs: [],
  plan: null,
  planId: null,
  busy: false,
  autoScroll: true,
  levelFilter: new Set(ALL_LEVELS),

  setConnected: (v) => set({ connected: v }),

  applyEvent: (event) =>
    set((s) => {
      switch (event.type) {
        case "log": {
          const logs = [...s.logs, event.entry];
          if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
          return { logs };
        }
        case "state":
          return { world: event.state };
        case "status":
          return { world: { ...s.world, execution: event.status } };
        default:
          return {};
      }
    }),

  // On (re)connect the server replays its snapshot; drop stale local logs first.
  resetSnapshot: () => set({ logs: [] }),

  setPlan: (plan, planId = null) => set({ plan, planId }),
  setBusy: (v) => set({ busy: v }),
  setAutoScroll: (v) => set({ autoScroll: v }),
  toggleLevel: (level) =>
    set((s) => {
      const next = new Set(s.levelFilter);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return { levelFilter: next };
    }),
  clearLogs: () => set({ logs: [] }),
}));

export { ALL_LEVELS };
