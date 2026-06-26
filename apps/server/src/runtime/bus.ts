import { EventEmitter } from "node:events";
import type {
  ExecutionStatus,
  LogEntry,
  LogLevel,
  ServerEvent,
  WorldState,
} from "@nightsmith/shared";
import { emptyWorldState } from "@nightsmith/shared";

const MAX_LOG_BUFFER = 1000;

/**
 * In-process pub/sub for real-time UI events. Buffers recent logs and the
 * latest world-state snapshot so a newly connected WebSocket client can be
 * brought fully up to date on subscribe.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly logs: LogEntry[] = [];
  private latestState: WorldState = emptyWorldState();
  private logSeq = 0;

  constructor() {
    // Allow many concurrent WS clients without Node's leak warning.
    this.emitter.setMaxListeners(0);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  log(level: LogLevel, message: string, scope?: string): LogEntry {
    const entry: LogEntry = {
      id: `log-${++this.logSeq}`,
      ts: new Date().toISOString(),
      level,
      message,
      ...(scope ? { scope } : {}),
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_BUFFER) this.logs.shift();
    this.publish({ type: "log", entry });
    return entry;
  }

  setState(state: WorldState): void {
    this.latestState = state;
    this.publish({ type: "state", state });
  }

  status(status: ExecutionStatus, message?: string): void {
    this.publish({ type: "status", status, ...(message ? { message } : {}) });
  }

  /** Snapshot for newly connected clients: buffered logs + latest state. */
  snapshot(): { logs: LogEntry[]; state: WorldState } {
    return { logs: [...this.logs], state: this.latestState };
  }

  clearLogs(): void {
    this.logs.length = 0;
  }

  private publish(event: ServerEvent): void {
    this.emitter.emit("event", event);
  }
}
