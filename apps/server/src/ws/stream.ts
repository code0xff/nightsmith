import type { FastifyInstance } from "fastify";
import type { ServerEvent } from "@blacksmith/shared";
import type { Runtime } from "../runtime/runtime.js";

/**
 * Single multiplexed WebSocket at /ws. On connect, a client receives a
 * snapshot (buffered logs + current state), then a live stream of log, state,
 * and execution-status events.
 */
export function registerWebSocket(app: FastifyInstance, runtime: Runtime): void {
  app.get("/ws", { websocket: true }, (socket) => {
    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    };

    const { logs, state } = runtime.bus.snapshot();
    for (const entry of logs) send({ type: "log", entry });
    send({ type: "state", state });

    const unsubscribe = runtime.bus.subscribe(send);
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
