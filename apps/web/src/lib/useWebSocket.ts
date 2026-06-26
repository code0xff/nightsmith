import { useEffect, useRef } from "react";
import { ServerEvent } from "@blacksmith/shared";
import { useAppStore } from "@/state/useAppStore";

/**
 * Maintain a single WebSocket to /ws with auto-reconnect. The server replays a
 * snapshot (buffered logs + current state) on connect, so we clear local logs
 * before each (re)connection to avoid duplicates.
 */
export function useWebSocket(): void {
  const applyEvent = useAppStore((s) => s.applyEvent);
  const setConnected = useAppStore((s) => s.setConnected);
  const resetSnapshot = useAppStore((s) => s.resetSnapshot);
  const retry = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let closed = false;
    // The socket currently considered "active"; stale sockets' late events are
    // ignored (important under React StrictMode's double-invoke).
    let current: WebSocket | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${proto}://${window.location.host}/ws`);
      current = socket;

      socket.onopen = () => {
        if (socket !== current) return;
        resetSnapshot();
        setConnected(true);
      };
      socket.onmessage = (e) => {
        if (socket !== current) return;
        try {
          const parsed = ServerEvent.safeParse(JSON.parse(String(e.data)));
          if (parsed.success) applyEvent(parsed.data);
        } catch {
          // Ignore non-JSON / malformed frames.
        }
      };
      socket.onclose = () => {
        if (socket !== current) return; // a superseded socket closing; ignore
        setConnected(false);
        if (!closed) retry.current = setTimeout(connect, 1500);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry.current) clearTimeout(retry.current);
      const socket = current;
      current = null; // mark all handlers stale before closing
      socket?.close();
    };
  }, [applyEvent, setConnected, resetSnapshot]);
}
