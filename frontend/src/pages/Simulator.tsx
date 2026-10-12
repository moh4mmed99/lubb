import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inputClass } from "../components/ui";
import { wsUrl } from "../lib/useHub";
import type { SpeakerState } from "../types";

// Acts as one speaker button, speaking the protocol in docs/device-protocol.md.
// Open it on a phone (same Wi-Fi) to stand in for real hardware.

const LED: Record<SpeakerState, string> = {
  ready: "#3b82f6",
  talking: "#22c55e",
  waiting: "#f59e0b",
  muted: "#ef4444",
};

// Converts mic audio to 16-bit PCM frames inside the audio thread.
const WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  process([input]) {
    const ch = input[0];
    if (ch) {
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) out[i] = Math.max(-1, Math.min(1, ch[i])) * 0x7fff;
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm16", Pcm16);`;

export function Simulator() {
  const { t } = useTranslation();
  const [deviceId, setDeviceId] = useState("btn-1");
  const [led, setLed] = useState<SpeakerState | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const pressed = useRef(false);

  useEffect(() => {
    const socket = new WebSocket(wsUrl(`/ws/device/${deviceId}`));
    socket.binaryType = "arraybuffer";
    socket.onopen = () => socket.send(JSON.stringify({ type: "hello", firmware: "simulator", battery: 100 }));
    socket.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.type === "led") setLed(msg.state);
    };
    socket.onclose = () => setLed(null);
    ws.current = socket;
    return () => socket.close();
  }, [deviceId]);

  const startMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
    const ctx = new AudioContext({ sampleRate: 16_000 });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
    const node = new AudioWorkletNode(ctx, "pcm16");
    node.port.onmessage = (e) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(e.data);
    ctx.createMediaStreamSource(stream).connect(node);
    audio.current = { ctx, stream };
  };

  const stopMic = () => {
    audio.current?.stream.getTracks().forEach((tr) => tr.stop());
    audio.current?.ctx.close();
    audio.current = null;
  };

  const press = async () => {
    pressed.current = true;
    ws.current?.send(JSON.stringify({ type: "button_down" }));
    // Mic opens on press; the hub ignores audio unless it granted the floor.
    await startMic().catch((err) => console.error("Microphone unavailable", err));
    if (!pressed.current) stopMic(); // released before the mic finished opening
  };

  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    stopMic();
    ws.current?.send(JSON.stringify({ type: "button_up" }));
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
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={`${inputClass} w-40 text-center`} dir="ltr">
          {Array.from({ length: 20 }, (_, i) => `btn-${i + 1}`).map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        <p className="text-xs text-muted">{t("simulator.hold")}</p>
      </div>
    </div>
  );
}
