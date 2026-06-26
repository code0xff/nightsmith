import { useEffect, useRef } from "react";
import type { ServerEvent } from "@blacksmith/shared";
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
    let socket: WebSocket | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}/ws`);

      socket.onopen = () => {
        resetSnapshot();
        setConnected(true);
      };
      socket.onmessage = (e) => {
        try {
          applyEvent(JSON.parse(e.data) as ServerEvent);
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry.current = setTimeout(connect, 1500);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry.current) clearTimeout(retry.current);
      socket?.close();
    };
  }, [applyEvent, setConnected, resetSnapshot]);
}
