"use client";

import { Archive, ListChecks, Mic, PlusCircle, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Loading, Notice, VoiceBars } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { addUtterance, elapsed, formatDate, mmss, speakingTime } from "@/lib/format";
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
              <Avatar name={p.name} color={p.color} size="sm" ring={talking} dim={state === "offline"} />
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
        <SidePanel meeting={meeting} />
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
              <Avatar name={p?.name ?? "?"} color={p?.color ?? "#71717a"} size="sm" />
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

function SidePanel({ meeting }) {
  const { t } = useTranslation();
  const talk = speakingTime(meeting);
  const maxTalk = Math.max(...Object.values(talk), 1);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t("setup.agenda")} />
        {meeting.agenda.length ? (
          <ol className="space-y-2 p-5 text-sm">
            {meeting.agenda.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <bdi>{item}</bdi>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-5 text-sm text-muted">{t("live.noAgenda")}</p>
        )}
      </Card>

      <Card>
        <CardHeader title={t("report.speakingTime")} />
        <ul className="space-y-3 p-5">
          {meeting.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 truncate">{p.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full transition-all" style={{ width: `${((talk[p.id] ?? 0) / maxTalk) * 100}%`, backgroundColor: p.color }} />
              </div>
              <span className="w-10 text-end font-mono text-xs text-muted" dir="ltr">
                {mmss(talk[p.id] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="flex items-center gap-2 px-1 text-xs text-muted">
        <ListChecks size={14} />
        {t("live.aiNote")}
      </p>
    </div>
  );
}
