"use client";

import { useEffect, useRef, useState } from "react";

function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

// One connection to the hub for the whole app, opened on first use and kept open across pages.
// (A socket per page meant every page switch waited for a new connection before loading anything.)
const listeners = new Set(); // (event) => void
const watchers = new Set(); // (connected) => void
let socket = null;
let status = null; // null until the first connection settles, then true / false

function setStatus(next) {
  status = next;
  watchers.forEach((w) => w(next));
}

function open() {
  socket = new WebSocket(wsUrl("/api/meetings/ws"));
  socket.onopen = () => setStatus(true);
  socket.onclose = () => {
    socket = null;
    setStatus(false);
    setTimeout(open, 2000); // keep trying until the hub is back
  };
  socket.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    listeners.forEach((l) => l(event));
  };
}

/**
 * Live events from the hub (see HubEvent in docs/device-protocol.md and backend/app/routers).
 * Calls onEvent for every event. Returns whether the hub is connected, so callers can (re)load their
 * data whenever the connection comes back: null while the first connection is still opening, then
 * true / false. On a page switch the connection is already up, so it is true straight away.
 * Show "hub is down" only for `=== false`, or every page flashes it while it connects.
 */
export function useHub(onEvent) {
  const [connected, setConnected] = useState(status);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const listener = (event) => handler.current?.(event);
    listeners.add(listener);
    watchers.add(setConnected);
    if (!socket && status !== false) open(); // status false = already retrying
    setConnected(status);
    return () => {
      listeners.delete(listener);
      watchers.delete(setConnected);
    };
  }, []);

  return connected;
}
