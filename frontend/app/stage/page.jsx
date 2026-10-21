"use client";

import { ArrowLeft, ArrowRight, Maximize, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wordmark } from "@/components/Brand";
import { SpeakerPhoto } from "@/components/SpeakerSpotlight";
import { elapsed, formatDate, mmss } from "@/lib/format";
import { useLiveMeeting } from "@/lib/useLiveMeeting";

// Room screen: full-screen view for the meeting-room monitor. A flat green field with the wordmark,
// and one black box holding everything people need to read: who is speaking, the agenda item,
// who is next, and the latest line of the transcript. Every seat's button state runs along the bottom.

const STATE_DOT = {
  talking: "bg-signal",
  waiting: "bg-[#f5a524]",
  muted: "bg-[#ff5a4e]",
  ready: "bg-white/50",
  offline: "bg-white/15",
};

export default function StagePage() {
  const { t, i18n } = useTranslation();
  const { meeting, connected, stateOf } = useLiveMeeting();
  const turns = useTurnStarts(meeting, stateOf);
  const Arrow = i18n.language === "ar" ? ArrowLeft : ArrowRight;

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const controls = (
    <div className="flex opacity-30 transition-opacity hover:opacity-100">
      <button onClick={fullscreen} title={t("stage.fullscreen")} aria-label={t("stage.fullscreen")} className="grid size-10 place-items-center hover:bg-black hover:text-white">
        <Maximize size={18} />
      </button>
      <Link href="/" title={t("stage.exit")} aria-label={t("stage.exit")} className="grid size-10 place-items-center hover:bg-black hover:text-white">
        <X size={20} />
      </Link>
    </div>
  );

  const brand = (caption) => (
    <div>
      <Wordmark size="md" />
      <p className="label mt-1 max-w-[16rem] text-[13px]">{caption}</p>
    </div>
  );

  // No meeting: the wordmark, the time, and a note that the room is waiting
  if (!meeting) {
    return (
      <div className="flex h-full flex-col bg-signal p-6 text-black md:p-10">
        <div className="flex items-start justify-between">
          {brand(t("brand.tagline"))}
          {controls}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-10">
          <Wordmark size="lg" />
          <Box className="w-full max-w-2xl">
            <Row>
              <WallClock />
            </Row>
            {meeting === null && (
              <Row>
                <span className="text-2xl">{t("stage.waiting")}</span>
              </Row>
            )}
            {!connected && meeting !== undefined && (
              <Row>
                <span className="text-xl text-[#ff5a4e]">{t("common.hubDown")}</span>
              </Row>
            )}
          </Box>
        </div>
      </div>
    );
  }

  const byId = Object.fromEntries(meeting.participants.map((p) => [p.id, p]));
  const talking = meeting.participants.filter((p) => stateOf(p) === "talking");
  const waiting = meeting.participants.filter((p) => stateOf(p) === "waiting");
  const last = meeting.utterances.at(-1);
  const agendaItem = meeting.agenda_index < meeting.agenda.length ? meeting.agenda[meeting.agenda_index] : null;

  return (
    <div className="flex h-full flex-col bg-signal text-black">
      <header className="flex items-start justify-between gap-6 p-6 md:px-10 md:pt-8">
        {brand(<bdi>{meeting.title}</bdi>)}
        <div className="flex items-start gap-4">
          <div className="text-end">
            <Elapsed since={meeting.started_at} />
            <p className="label mt-1 inline-flex items-center gap-2 text-[13px]">
              <span className="size-2 animate-pulse bg-black" />
              {connected ? t("live.recording") : t("common.disconnected")}
            </p>
          </div>
          {controls}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-6 md:px-10">
        <Box className="w-full max-w-5xl">
          {/* Who has the floor */}
          {talking.length > 0 ? (
            talking.map((p) => (
              <Row key={p.id} big>
                {/* the speaker's face, large, popping in as they take the floor */}
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className="shrink-0"
                >
                  <SpeakerPhoto person={p} className="size-28 text-5xl ring-4 ring-signal md:size-36 md:text-6xl" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-6xl font-semibold tracking-tight md:text-7xl">
                    <bdi>{p.name}</bdi>
                  </div>
                  {p.title && (
                    <div className="mt-2 truncate text-2xl text-white/60">
                      <bdi>{p.title}</bdi>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-3">
                  <Waveform />
                  {turns[p.id] && <TurnTimer since={turns[p.id]} label={t("stage.turn")} />}
                </div>
              </Row>
            ))
          ) : (
            <Row big>
              <div>
                <div className="text-6xl font-semibold tracking-tight md:text-7xl">{t("stage.floorOpen")}</div>
                <div className="mt-2 text-2xl text-white/60">{t("stage.hint")}</div>
              </div>
            </Row>
          )}

          {agendaItem && (
            <Row>
              <span className="label w-32 shrink-0 text-[13px] text-white/60">
                {t("live.item", { n: meeting.agenda_index + 1, total: meeting.agenda.length })}
              </span>
              <span className="min-w-0 flex-1 truncate text-2xl">
                <bdi>{agendaItem}</bdi>
              </span>
            </Row>
          )}

          {waiting.length > 0 && (
            <Row>
              <span className="label w-32 shrink-0 text-[13px] text-white/60">{t("stage.next")}</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 text-2xl">
                {waiting.map((p, i) => (
                  <span key={p.id} className="inline-flex items-center gap-3">
                    {i > 0 && <Arrow size={18} className="text-white/40" />}
                    <bdi>{p.name}</bdi>
                  </span>
                ))}
              </span>
            </Row>
          )}

          {last && (
            <Row>
              <span className="label w-32 shrink-0 truncate pt-1.5 text-[13px] text-white/60">
                <bdi>{byId[last.participant_id]?.name ?? "?"}</bdi>
              </span>
              <p key={last.id} dir="auto" className="line-clamp-2 min-w-0 flex-1 text-2xl leading-snug">
                {last.text}
              </p>
            </Row>
          )}
        </Box>
      </main>

      {/* Every seat and its button state */}
      <footer className="m-6 flex flex-wrap gap-x-6 gap-y-2 bg-black px-6 py-4 text-white md:mx-10 md:mb-8">
        {meeting.participants.map((p) => {
          const state = stateOf(p);
          return (
            <span key={p.id} className={`inline-flex items-center gap-2 text-sm ${state === "offline" ? "text-white/40" : ""}`}>
              <span className={`size-2.5 ${STATE_DOT[state]}`} />
              <bdi>{p.name}</bdi>
            </span>
          );
        })}
      </footer>
    </div>
  );
}

/** The black box from the Config homepage: padding, then rows split by hairlines. */
function Box({ className = "", children }) {
  return <div className={`bg-black px-6 pb-2 text-white md:px-8 ${className}`}>{children}</div>;
}

function Row({ big = false, children }) {
  return (
    <div className={`flex justify-between gap-6 border-b border-white/20 last:border-b-0 ${big ? "items-center py-8" : "items-start py-4"}`}>{children}</div>
  );
}

const WAVE = Array.from({ length: 18 }, (_, i) => ({ delay: ((i * 37) % 11) / 10, speed: 0.6 + ((i * 53) % 7) / 10 }));

function Waveform() {
  return (
    <span className="flex h-12 items-center gap-1" aria-hidden>
      {WAVE.map((b, i) => (
        <span key={i} className="h-full w-1 origin-center bg-signal" style={{ animation: `bar ${b.speed}s ${b.delay}s ease-in-out infinite` }} />
      ))}
    </span>
  );
}

/** When each current speaker started this turn (local time), so the screen can show how long they've talked. */
function useTurnStarts(meeting, stateOf) {
  const [starts, setStarts] = useState({});
  const talkingKey = meeting ? meeting.participants.filter((p) => stateOf(p) === "talking").map((p) => p.id).join(",") : "";
  const prev = useRef("");

  useEffect(() => {
    if (talkingKey === prev.current) return;
    prev.current = talkingKey;
    const ids = talkingKey ? talkingKey.split(",") : [];
    setStarts((s) => Object.fromEntries(ids.map((id) => [id, s[id] ?? Date.now()])));
  }, [talkingKey]);

  return starts;
}

function useNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function TurnTimer({ since, label }) {
  const now = useNow();
  const secs = now ? Math.max(0, Math.floor((now.getTime() - since) / 1000)) : 0;
  return (
    <span className="label text-[13px] text-white/60">
      {label}{" "}
      <span className="font-mono text-lg text-white tabular-nums" dir="ltr">
        {mmss(secs)}
      </span>
    </span>
  );
}

function Elapsed({ since }) {
  const now = useNow();
  return (
    <span className="font-mono text-4xl font-semibold tabular-nums" dir="ltr">
      {now ? elapsed(since, now.toISOString()) : "00:00:00"}
    </span>
  );
}

function WallClock() {
  const { i18n } = useTranslation();
  const now = useNow();
  if (!now) return <span className="font-mono text-5xl">--:--</span>;
  return (
    <>
      <span className="font-mono text-5xl font-semibold tabular-nums" dir="ltr">
        {formatDate(now.toISOString(), i18n.language, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="label pt-3 text-[13px] text-white/60">{formatDate(now.toISOString(), i18n.language, { dateStyle: "full" })}</span>
    </>
  );
}
