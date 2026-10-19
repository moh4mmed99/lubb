"use client";

import { useEffect, useRef, useState } from "react";

function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

/**
 * Live events from the hub (see HubEvent in docs/device-protocol.md and backend/app/routers).
 * Calls onEvent for every event and reconnects automatically. Returns whether the hub is connected,
 * so callers can (re)load their data whenever the connection comes back:
 * null while the first connection is still opening, then true / false.
 * Show "hub is down" only for `=== false`, or every page flashes it while it connects.
 */
export function useHub(onEvent) {
  const [connected, setConnected] = useState(null);
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
        // We closed it ourselves (page left, or React's dev double-mount): not an outage.
        // Reporting it would flash "hub is down" on the next page while its own socket connects.
        if (closed) return;
        setConnected(false);
        retry = setTimeout(connect, 2000);
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
