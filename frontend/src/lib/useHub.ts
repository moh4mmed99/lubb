import { useEffect, useState } from "react";
import type { HubEvent, SpeakerState, Utterance } from "../types";

function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

/** Live events from the hub. Reconnects automatically; `connected` is false while the hub is down. */
export function useHub() {
  const [connected, setConnected] = useState(false);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [speakerStates, setSpeakerStates] = useState<Record<string, SpeakerState>>({});

  useEffect(() => {
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl("/api/meetings/ws"));
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onmessage = (msg) => {
        const event: HubEvent = JSON.parse(msg.data);
        if (event.type === "utterance") setUtterances((u) => [...u, event.utterance]);
        if (event.type === "speaker_state")
          setSpeakerStates((s) => ({ ...s, [event.device_id]: event.state }));
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws.close();
    };
  }, []);

  return { connected, utterances, speakerStates };
}

export { wsUrl };
