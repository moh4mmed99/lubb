"use client";

import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inputClass } from "@/components/ui";
import { BUTTONS } from "@/lib/format";
import { wsUrl } from "@/lib/useHub";

// Acts as one speaker button, speaking the protocol in docs/device-protocol.md.
// Open it on a phone (same Wi-Fi) to stand in for real hardware.

const LED = {
  ready: "#3b82f6",
  talking: "#22c55e",
  waiting: "#f59e0b",
  muted: "#ef4444",
};

// Resamples mic audio (usually 44.1/48 kHz) to 16 kHz 16-bit PCM inside the audio thread.
// Averaging each window is a crude low-pass filter, good enough for speech.
const WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  step = sampleRate / 16000;
  pos = 0;
  process([input]) {
    const ch = input[0];
    if (ch) {
      const out = new Int16Array(Math.ceil(ch.length / this.step) + 1);
      let n = 0;
      for (; this.pos < ch.length; this.pos += this.step) {
        const start = Math.floor(this.pos), end = Math.min(ch.length, Math.floor(this.pos + this.step)) || start + 1;
        let sum = 0;
        for (let i = start; i < end; i++) sum += ch[i];
        out[n++] = Math.max(-1, Math.min(1, sum / Math.max(1, end - start))) * 0x7fff;
      }
      this.pos -= ch.length;
      const frame = out.slice(0, n);
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm16", Pcm16);`;

export default function SimulatorPage() {
  const { t } = useTranslation();
  const [deviceId, setDeviceId] = useState("btn-1");
  const [led, setLed] = useState(null);
  const [micError, setMicError] = useState(null);
  const ws = useRef(null);
  const ctx = useRef(null);
  const pressed = useRef(false);

  // Remember which button this device plays, so a phone keeps its seat across reloads.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("simulator.device");
      if (saved && BUTTONS.includes(saved)) setDeviceId(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const chooseDevice = (id) => {
    setDeviceId(id);
    try {
      localStorage.setItem("simulator.device", id);
    } catch {
      /* storage unavailable */
    }
  };

  // Connect to the hub as this button, reconnecting whenever the connection drops.
  useEffect(() => {
    let socket;
    let retry;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(wsUrl(`/ws/device/${deviceId}`));
      socket.binaryType = "arraybuffer";
      socket.onopen = () => socket.send(JSON.stringify({ type: "hello", firmware: "simulator", battery: 100 }));
      socket.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.type === "led") setLed(msg.state);
      };
      socket.onclose = () => {
        setLed(null);
        pressed.current = false;
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.current = socket;
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      socket.close();
    };
  }, [deviceId]);

  // Open the mic once, up front: asking for permission mid-press would cancel the press.
  useEffect(() => {
    let stream;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices) throw new Error("needs_https"); // mic needs HTTPS or localhost
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
        const audioCtx = new AudioContext(); // native rate; the worklet resamples to 16 kHz
        await audioCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
        const node = new AudioWorkletNode(audioCtx, "pcm16");
        node.port.onmessage = (e) => {
          if (pressed.current && ws.current?.readyState === WebSocket.OPEN) ws.current.send(e.data);
        };
        audioCtx.createMediaStreamSource(stream).connect(node);
        node.connect(audioCtx.destination); // outputs silence; keeps every browser pulling audio through it
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          audioCtx.close();
        } else ctx.current = audioCtx;
      } catch (err) {
        setMicError(err.message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      ctx.current?.close();
      ctx.current = null;
    };
  }, []);

  const press = () => {
    if (ws.current?.readyState !== WebSocket.OPEN) return;
    pressed.current = true;
    ctx.current?.resume(); // browsers keep audio suspended until a user gesture
    // Audio flows while pressed; the hub ignores it unless it granted the floor.
    ws.current.send(JSON.stringify({ type: "button_down" }));
  };

  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "button_up" }));
  };

  const color = led ? LED[led] : "var(--line)";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-10 p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">{t("simulator.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("simulator.subtitle")}</p>
      </div>

      <button
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        disabled={!led}
        className="grid size-52 touch-none select-none place-items-center rounded-full border-[6px] bg-card shadow-sm transition active:scale-95 disabled:cursor-not-allowed"
        style={{ borderColor: color, boxShadow: led ? `0 0 48px ${color}55` : undefined }}
      >
        <span className="flex flex-col items-center gap-2">
          <Mic size={36} strokeWidth={1.5} style={{ color: led ? color : "var(--muted)" }} />
          <span className="text-sm font-medium">{led ? t(`speaker.${led}`) : t("simulator.offline")}</span>
        </span>
      </button>

      <div className="flex flex-col items-center gap-2">
        <select value={deviceId} onChange={(e) => chooseDevice(e.target.value)} className={`${inputClass} w-40 text-center`} dir="ltr">
          {BUTTONS.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        <p className="text-xs text-muted">{led === "muted" ? t("simulator.mutedHint") : t("simulator.hold")}</p>
        {micError && (
          <p className="max-w-xs text-xs text-danger" dir="auto">
            {micError === "needs_https" ? t("simulator.needsHttps") : `${t("simulator.micError")}: ${micError}`}
          </p>
        )}
      </div>
    </div>
  );
}
