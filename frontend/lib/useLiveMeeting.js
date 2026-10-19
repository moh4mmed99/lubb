"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorText } from "@/lib/api";
import { addUtterance } from "@/lib/format";
import { useHub } from "@/lib/useHub";

/**
 * The live meeting and the connected buttons, kept up to date from hub events.
 * Shared by the dashboard (/) and the room screen (/stage).
 */
export function useLiveMeeting() {
  const { t } = useTranslation();
  const [meeting, setMeeting] = useState(undefined); // undefined = loading, null = no live meeting
  const [devices, setDevices] = useState({}); // device_id -> { state, battery }
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [all, devs] = await Promise.all([api("/meetings"), api("/devices")]);
      setMeeting(all.find((m) => m.status === "live") ?? null);
      setDevices(Object.fromEntries(devs.map((d) => [d.device_id, d])));
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  const connected = useHub((e) => {
    switch (e.type) {
      case "utterance":
        setMeeting((m) => (m && m.id === e.meeting_id ? { ...m, utterances: addUtterance(m.utterances, e.utterance) } : m));
        break;
      case "speaker_state":
        setDevices((d) => ({ ...d, [e.device_id]: { ...d[e.device_id], device_id: e.device_id, state: e.state } }));
        break;
      case "device_connected":
        setDevices((d) => ({ ...d, [e.device_id]: { device_id: e.device_id, state: null, battery: null } }));
        break;
      case "device_disconnected":
        setDevices(({ [e.device_id]: _gone, ...rest }) => rest);
        break;
      case "battery":
        setDevices((d) => (d[e.device_id] ? { ...d, [e.device_id]: { ...d[e.device_id], battery: e.level } } : d));
        break;
      case "agenda":
        setMeeting((m) => (m && m.id === e.meeting_id ? { ...m, agenda_index: e.index } : m));
        break;
      case "meeting_started":
      case "meeting_ended":
        load();
        break;
      case "error":
        setError(`${t("live.sttError")}: ${e.message}`);
        break;
    }
  });

  // (Re)load whenever the hub connection comes up, so nothing is missed while it was down.
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  /** A participant's button state: talking / waiting / muted / ready, or offline when their button isn't connected. */
  const stateOf = (p) => {
    const dev = p.device_id && devices[p.device_id];
    return dev ? dev.state || "ready" : "offline";
  };

  return { meeting, setMeeting, devices, error, setError, connected, stateOf };
}
