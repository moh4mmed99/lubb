"use client";

import { useEffect, useRef, useState } from "react";

export function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

/**
 * Live events from the hub (see HubEvent in docs/device-protocol.md and backend/app/routers).
 * Calls onEvent for every event and reconnects automatically. Returns whether the hub is connected,
 * so callers can (re)load their data whenever the connection comes back.
 */
export function useHub(onEvent) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let ws;
    let retry;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl("/api/meetings/ws"));
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onmessage = (msg) => handler.current?.(JSON.parse(msg.data));
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws.close();
    };
  }, []);

  return connected;
}
