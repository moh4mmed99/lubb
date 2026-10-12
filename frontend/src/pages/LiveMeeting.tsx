import { Cpu, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Avatar, Badge, Button, Card, Segmented, VoiceBars } from "../components/ui";
import { elapsed, formatDate } from "../lib/format";
import { useHub } from "../lib/useHub";
import { mockMeeting, mockSpeakerStates } from "../mocks/meeting";
import type { Meeting, Participant, SpeakerState } from "../types";

type Tab = "summary" | "decisions" | "tasks";

export function LiveMeeting() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const hub = useHub();
  const [liveMeeting, setLiveMeeting] = useState<Meeting | null>(null);
  // Real meeting from the hub when one is live; otherwise the prototype's sample data
  const meeting = liveMeeting ?? mockMeeting;

  useEffect(() => {
    if (!hub.connected) return;
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((all: Meeting[]) => setLiveMeeting(all.find((m) => m.status === "live") ?? null))
      .catch(() => setLiveMeeting(null));
  }, [hub.connected]);

  const [now, setNow] = useState(() => new Date());
  const [mockStart] = useState(() => new Date(Date.now() - (24 * 60 + 18) * 1000).toISOString());
  const timerStart = liveMeeting?.started_at ?? mockStart;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const utterances = [...meeting.utterances, ...hub.utterances];
  const states = liveMeeting ? hub.speakerStates : mockSpeakerStates;
  const stateOf = (p: Participant): SpeakerState => (p.device_id && states[p.device_id]) || "ready";
  const speaking = meeting.participants.find((p) => stateOf(p) === "talking");

  const endMeeting = async () => {
    if (liveMeeting) await fetch(`/api/meetings/${liveMeeting.id}/end`, { method: "POST" }).catch(() => {});
    navigate("/report");
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-8 lg:h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{meeting.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{formatDate(meeting.started_at!, i18n.language, { dateStyle: "full" })}</span>
            <span>·</span>
            <span>{t("common.participants", { count: meeting.participants.length })}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Cpu size={14} /> {t("common.localAi")}
            </span>
            <Badge tone={hub.connected ? "ok" : "muted"}>{hub.connected ? t("common.connected") : t("common.mockData")}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-pulse rounded-full bg-danger" />
            {t("live.recording")}
          </span>
          <span className="font-mono text-lg tabular-nums" dir="ltr">
            {elapsed(timerStart, now.toISOString())}
          </span>
          <Button variant="danger" onClick={endMeeting}>
            <Square size={14} fill="currentColor" />
            {t("live.end")}
          </Button>
        </div>
      </div>

      {/* Speakers — wraps for up to 20 seats */}
      <div className="flex flex-wrap gap-2">
        {meeting.participants.map((p) => {
          const state = stateOf(p);
          const talking = state === "talking";
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2.5 rounded-full border py-1.5 ps-1.5 pe-4 transition ${
                talking ? "bg-card" : "border-line bg-card/50"
              }`}
              style={talking ? { borderColor: p.color } : undefined}
            >
              <Avatar name={p.name} color={p.color} size="sm" ring={talking} />
              <div className="leading-tight">
                <div className="text-sm font-medium">{p.name}</div>
                <div className={`text-[11px] ${state === "waiting" ? "text-amber-500" : "text-muted"}`}>
                  {t(`speaker.${state}`)}
                </div>
              </div>
              {talking && <VoiceBars color={p.color} />}
            </div>
          );
        })}
      </div>

      {/* Transcript + AI side panel */}
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Transcript meeting={meeting} utterances={utterances} speaking={speaking} />
        <AiPanel meeting={meeting} />
      </div>
    </div>
  );
}

function Transcript({
  meeting,
  utterances,
  speaking,
}: {
  meeting: Meeting;
  utterances: Meeting["utterances"];
  speaking?: Participant;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const byId = Object.fromEntries(meeting.participants.map((p) => [p.id, p]));

  // Scroll only the transcript box (not the page) to the newest line
  useEffect(() => {
    const el = listRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [utterances.length]);

  return (
    <Card className="flex min-h-[24rem] flex-col">
      <div className="border-b border-line px-5 py-3.5 text-sm font-semibold">{t("live.transcript")}</div>
      <div ref={listRef} className="max-h-[60vh] flex-1 space-y-5 overflow-y-auto px-5 py-5 lg:max-h-none">
        {utterances.map((u) => {
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
                    {elapsed(meeting.started_at!, u.started_at)}
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

function AiPanel({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("summary");
  const report = meeting.report;
  const names = Object.fromEntries(meeting.participants.map((p) => [p.id, p.name]));

  return (
    <Card className="flex flex-col">
      <div className="border-b border-line p-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "summary", label: t("live.summary") },
            { value: "decisions", label: t("live.decisions") },
            { value: "tasks", label: t("live.tasks") },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed">
        {tab === "summary" && (
          <ul className="space-y-3">
            {report?.summary.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                {s}
              </li>
            ))}
          </ul>
        )}
        {tab === "decisions" && (
          <ol className="space-y-3">
            {report?.decisions.map((d, i) => (
              <li key={d.id} className="flex gap-3">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                {d.text}
              </li>
            ))}
          </ol>
        )}
        {tab === "tasks" && (
          <ul className="divide-y divide-line">
            {report?.tasks.map((task) => (
              <li key={task.id} className="py-2.5 first:pt-0">
                <div>{task.text}</div>
                <div className="mt-0.5 flex justify-between text-xs text-muted">
                  <span>{task.owner_id ? names[task.owner_id] : "—"}</span>
                  <span className="font-mono">{task.due_date}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-muted">
        <Cpu size={13} />
        {t("live.aiNote")}
      </div>
    </Card>
  );
}
