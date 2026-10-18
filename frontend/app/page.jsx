"use client";

import { Archive, Check, ChevronLeft, ChevronRight, ListChecks, Mic, PlusCircle, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MeetingStats } from "@/components/MeetingStats";
import { Avatar, Badge, Button, Card, EmptyState, Loading, Notice, Segmented, VoiceBars } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { addUtterance, elapsed, formatDate } from "@/lib/format";
import { useHub } from "@/lib/useHub";

export default function LiveMeetingPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [meeting, setMeeting] = useState(undefined); // undefined = loading, null = no live meeting
  const [devices, setDevices] = useState({}); // device_id -> { state, battery }
  const [error, setError] = useState(null);
  const [ending, setEnding] = useState(false);

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

  const endMeeting = async () => {
    if (!meeting || !confirm(t("live.endConfirm"))) return;
    setEnding(true);
    try {
      await api(`/meetings/${meeting.id}/end`, { method: "POST" });
      router.push(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(errorText(err, t));
      setEnding(false);
    }
  };

  const moveAgenda = async (index) => {
    const next = Math.max(0, Math.min(index, meeting.agenda.length));
    const previous = meeting.agenda_index;
    setMeeting((m) => ({ ...m, agenda_index: next })); // optimistic; the hub broadcasts the same change
    try {
      await api(`/meetings/${meeting.id}/agenda`, { method: "POST", body: { index: next } });
    } catch (err) {
      setMeeting((m) => ({ ...m, agenda_index: previous }));
      setError(errorText(err, t));
    }
  };

  const offline = !connected && <Notice tone="danger">{t("common.hubDown")}</Notice>;

  if (meeting === undefined) {
    return <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">{offline || <Loading />}</div>;
  }

  if (meeting === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        {offline}
        {error && <Notice tone="danger">{error}</Notice>}
        <Card>
          <EmptyState icon={Mic} title={t("live.noneTitle")} text={t("live.noneText")}>
            <Link href="/setup">
              <Button variant="primary">
                <PlusCircle size={16} />
                {t("nav.setup")}
              </Button>
            </Link>
            <Link href="/meetings">
              <Button>
                <Archive size={16} />
                {t("nav.history")}
              </Button>
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  }

  const stateOf = (p) => {
    const dev = p.device_id && devices[p.device_id];
    return dev ? dev.state || "ready" : "offline";
  };
  const speaking = meeting.participants.find((p) => stateOf(p) === "talking");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-8 lg:h-full">
      {offline}
      {error && (
        <Notice tone="danger" action={<button className="text-xs text-muted hover:text-fg" onClick={() => setError(null)}>✕</button>}>
          {error}
        </Notice>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            <bdi>{meeting.title}</bdi>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{formatDate(meeting.started_at, i18n.language, { dateStyle: "full" })}</span>
            <span>·</span>
            <span>{t("common.participants", { count: meeting.participants.length })}</span>
            <span>·</span>
            <span>{t(`setup.floor.${meeting.floor_mode}`)}</span>
            <Badge tone={connected ? "ok" : "danger"}>{connected ? t("common.connected") : t("common.disconnected")}</Badge>
          </div>
          {meeting.agenda_index < meeting.agenda.length && (
            <p className="mt-2 text-sm">
              <span className="text-muted">{t("live.item", { n: meeting.agenda_index + 1, total: meeting.agenda.length })} · </span>
              <bdi className="font-medium">{meeting.agenda[meeting.agenda_index]}</bdi>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-pulse rounded-full bg-danger" />
            {t("live.recording")}
          </span>
          <Clock since={meeting.started_at} />
          <Button variant="danger" onClick={endMeeting} disabled={ending}>
            <Square size={14} fill="currentColor" />
            {ending ? t("live.ending") : t("live.end")}
          </Button>
        </div>
      </div>

      {/* Speakers — wraps for up to 20 seats */}
      <div className="flex flex-wrap gap-2">
        {meeting.participants.map((p) => {
          const state = stateOf(p);
          const talking = state === "talking";
          const battery = p.device_id && devices[p.device_id]?.battery;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2.5 rounded-full border py-1.5 ps-1.5 pe-4 transition ${
                talking ? "bg-card" : "border-line bg-card/50"
              }`}
              style={talking ? { borderColor: p.color } : undefined}
              title={p.device_id ? `${p.device_id}${battery != null ? ` · ${battery}%` : ""}` : undefined}
            >
              <Avatar name={p.name} color={p.color} photo={p.photo} size="sm" ring={talking} dim={state === "offline"} />
              <div className="leading-tight">
                <div className="text-sm font-medium">{p.name}</div>
                <div className={`text-[11px] ${state === "waiting" ? "text-warn" : state === "offline" ? "text-danger" : "text-muted"}`}>
                  {t(`speaker.${state}`)}
                </div>
              </div>
              {talking && <VoiceBars color={p.color} />}
            </div>
          );
        })}
      </div>

      {/* Transcript + side panel */}
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Transcript meeting={meeting} speaking={speaking} />
        <SidePanel meeting={meeting} onMoveAgenda={moveAgenda} />
      </div>
    </div>
  );
}

function Clock({ since }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-lg tabular-nums" dir="ltr">
      {now ? elapsed(since, now.toISOString()) : "00:00:00"}
    </span>
  );
}

function Transcript({ meeting, speaking }) {
  const { t } = useTranslation();
  const listRef = useRef(null);
  const byId = Object.fromEntries(meeting.participants.map((p) => [p.id, p]));

  // Scroll only the transcript box (not the page) to the newest line
  useEffect(() => {
    const el = listRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [meeting.utterances.length]);

  return (
    <Card className="flex min-h-[24rem] flex-col">
      <div className="border-b border-line px-5 py-3.5 text-sm font-semibold">{t("live.transcript")}</div>
      <div ref={listRef} className="max-h-[60vh] flex-1 space-y-5 overflow-y-auto px-5 py-5 lg:max-h-none">
        {meeting.utterances.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("live.transcriptEmpty")}</p>}
        {meeting.utterances.map((u) => {
          const p = byId[u.participant_id];
          return (
            <div key={u.id} className="flex gap-3">
              <Avatar name={p?.name ?? "?"} color={p?.color ?? "#71717a"} photo={p?.photo} size="sm" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium" style={{ color: p?.color }}>
                    {p?.name ?? "?"}
                  </span>
                  <span className="font-mono text-xs text-muted" dir="ltr">
                    {elapsed(meeting.started_at, u.started_at)}
                  </span>
                </div>
                {/* dir="auto": each line follows its own language (Arabic/English mixed meetings) */}
                <p dir="auto" className="mt-0.5 text-[15px] leading-relaxed">
                  {u.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {speaking && (
        <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-sm text-muted">
          <VoiceBars color={speaking.color} />
          {t("live.speakingNow", { name: speaking.name })}
        </div>
      )}
    </Card>
  );
}

function SidePanel({ meeting, onMoveAgenda }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("agenda");

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col">
        <div className="border-b border-line p-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "agenda", label: t("live.agenda") },
              { value: "stats", label: t("live.stats") },
            ]}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed">
          {tab === "agenda" ? (
            <AgendaList agenda={meeting.agenda} current={meeting.agenda_index} onSelect={onMoveAgenda} />
          ) : (
            <MeetingStats meeting={meeting} />
          )}
        </div>
        {tab === "agenda" && <AgendaFooter total={meeting.agenda.length} current={meeting.agenda_index} onMove={onMoveAgenda} />}
      </Card>

      <p className="flex items-center gap-2 px-1 text-xs text-muted">
        <ListChecks size={14} />
        {t("live.aiNote")}
      </p>
    </div>
  );
}

/** Done items get a check, the current one is highlighted; click any item to jump to it. */
function AgendaList({ agenda, current, onSelect }) {
  const { t } = useTranslation();
  if (!agenda.length) return <p className="text-muted">{t("live.noAgenda")}</p>;

  return (
    <ol className="space-y-1">
      {agenda.map((item, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={i}>
            <button
              onClick={() => onSelect(i)}
              className={`flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-start transition hover:bg-subtle ${active ? "bg-subtle" : ""}`}
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
                  done ? "border-fg bg-fg text-bg" : active ? "border-accent text-accent" : "border-line text-muted"
                }`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <bdi className={`flex-1 ${done ? "text-muted" : active ? "font-medium" : ""}`}>{item}</bdi>
              {active && (
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-accent">
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  {t("live.now")}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function AgendaFooter({ total, current, onMove }) {
  const { t, i18n } = useTranslation();
  // Arrows point in reading direction
  const [Back, Forward] = i18n.language === "ar" ? [ChevronRight, ChevronLeft] : [ChevronLeft, ChevronRight];
  if (!total) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-3">
      <Button onClick={() => onMove(current - 1)} disabled={current === 0} aria-label={t("live.previous")} className="px-2.5">
        <Back size={16} />
      </Button>
      {/* progress: one segment per item */}
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < current ? "bg-fg" : i === current ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
      {current >= total ? (
        <span className="px-2 text-xs text-ok">{t("live.allDone")}</span>
      ) : (
        <Button variant="primary" onClick={() => onMove(current + 1)}>
          {t("live.next")}
          <Forward size={16} />
        </Button>
      )}
    </div>
  );
}
