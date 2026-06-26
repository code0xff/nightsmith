import type { FastifyInstance } from "fastify";
import type { ServerEvent } from "@nightsmith/shared";
import type { Runtime } from "../runtime/runtime.js";

/**
 * Single multiplexed WebSocket at /ws. On connect, a client receives the
 * current world-state snapshot only — NOT buffered logs — so a page refresh
 * starts with a clean log console and then streams live log/state/status
 * events. (The live console is ephemeral; the durable record is the session
 * report on disk.)
 */
export function registerWebSocket(app: FastifyInstance, runtime: Runtime): void {
  app.get("/ws", { websocket: true }, (socket) => {
    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    };

    send({ type: "state", state: runtime.bus.snapshot().state });

    const unsubscribe = runtime.bus.subscribe(send);
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
