"use client";

// Overview: everything at a glance under one huge title. Whether a meeting is live, the totals (meetings,
// hours, minutes, tasks, presentations, buttons), the latest meetings and the tasks that need following up.
import { ArrowLeft, ArrowRight, CalendarClock, ListTodo, PlusCircle, Radio } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stagger, StaggerItem } from "@/components/motion";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, CardHeader, Notice } from "@/components/ui";
import { api, cached, errorText } from "@/lib/api";
import { elapsed, formatDate } from "@/lib/format";
import { useHub } from "@/lib/useHub";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
const hoursOf = (m) => (m.started_at && m.ended_at ? (Date.parse(m.ended_at) - Date.parse(m.started_at)) / 3_600_000 : 0);

export default function OverviewPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const Arrow = lng === "ar" ? ArrowLeft : ArrowRight;
  const [meetings, setMeetings] = useState(() => cached("/meetings") ?? []);
  const [decks, setDecks] = useState(() => cached("/presentations") ?? []);
  const [devices, setDevices] = useState(() => cached("/devices") ?? []);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [ms, ds, devs] = await Promise.all([api("/meetings"), api("/presentations"), api("/devices")]);
      setMeetings(ms);
      setDecks(ds);
      setDevices(devs);
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  const connected = useHub((e) => {
    if (["meeting_started", "meeting_ended", "report_ready", "device_connected", "device_disconnected", "presentation_ready"].includes(e.type)) load();
  });
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const live = meetings.find((m) => m.status === "live");
  const held = meetings.filter((m) => m.started_at);
  const ended = held.filter((m) => m.status === "ended");
  const reports = ended.filter((m) => m.report);
  const approved = reports.filter((m) => m.report.approved).length;
  const hours = Math.round(ended.reduce((s, m) => s + hoursOf(m), 0) * 10) / 10;
  const now = today();
  const openTasks = reports
    .flatMap((m) => m.report.tasks.filter((x) => !x.done).map((x) => ({ ...x, meeting: m })))
    .map((x) => ({ ...x, overdue: Boolean(x.due_date && x.due_date < now) }));
  const overdue = openTasks.filter((x) => x.overdue).length;
  // most urgent first: earliest due date (so overdue ones lead), undated last
  const attention = [...openTasks].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).slice(0, 5);
  const recent = held.slice(0, 5); // the hub lists newest first

  return (
    <div className="space-y-10 page">
      {/* The huge title: the page's single loudest element */}
      <header>
        <p className="label text-muted">{formatDate(new Date().toISOString(), lng, { dateStyle: "full" })}</p>
        {/* the brand as the title, same in both languages; bdi keeps "LUBB | لُبّ" in this order inside the Arabic page */}
        {/* "LUBB" in Outfit; لُبّ in the page font */}
        <h1 className="ms-[-0.04em] mt-8 text-[clamp(3.25rem,7vw,7rem)] font-semibold leading-[1.1] tracking-tight">
          <bdi dir="ltr">
            <span className="font-latin">LUBB</span> | لُبّ
          </bdi>
        </h1>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* Live status */}
      <Card className={live ? "border-danger/40!" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${live ? "bg-danger text-white" : "bg-fg/5 text-muted"}`}>
              <Radio size={20} className={live ? "animate-pulse" : ""} />
            </span>
            <div className="min-w-0">
              <p className={`label ${live ? "text-danger" : "text-muted"}`}>{live ? t("overview.liveNow") : t("overview.noLive")}</p>
              <p className="truncate text-lg font-semibold">
                {live ? <bdi>{live.title}</bdi> : <span className="font-normal text-muted">{t("overview.noLiveText")}</span>}
              </p>
              {live && (
                <p className="text-xs text-muted">
                  {t("overview.speakers", { count: live.participants.length })} ·{" "}
                  <span className="font-mono" dir="ltr">
                    <LiveClock since={live.started_at} />
                  </span>
                </p>
              )}
            </div>
          </div>
          <Link href={live ? "/" : "/setup"}>
            <Button variant="primary">
              {live ? <Arrow size={16} /> : <PlusCircle size={16} />}
              {live ? t("overview.open") : t("overview.startNew")}
            </Button>
          </Link>
        </div>
      </Card>

      {/* Totals in one row: meetings held leads as the wide dark tile */}
      <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7">
        <StaggerItem card className="col-span-2 md:col-span-3 xl:col-span-2">
          <Card className="flex h-full flex-col justify-between border-fg! bg-fg! p-6 text-bg">
            <p className="text-sm text-bg/70">{t("overview.meetings")}</p>
            <p className="mt-4 text-7xl font-semibold leading-none tracking-tight tabular-nums">{held.length}</p>
          </Card>
        </StaggerItem>
        <Total label={t("overview.hours")} value={hours} />
        <Total label={t("overview.minutes")} value={reports.length} note={reports.length ? `${t("overview.approved", { count: approved })} · ${t("overview.drafts", { count: reports.length - approved })}` : null} />
        <Total
          label={t("overview.tasks")}
          value={openTasks.length}
          note={openTasks.length ? (overdue ? t("overview.overdue", { count: overdue }) : t("overview.allDone")) : null}
          warn={overdue > 0}
        />
        <Total label={t("overview.presentations")} value={decks.length} />
        <Total label={t("overview.buttons")} value={devices.length} note={t("overview.ofButtons")} />
      </Stagger>

      {/* What happened lately, and what still needs doing */}
      <div className="fill grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader icon={CalendarClock} title={t("overview.recent")} action={<ViewAll href="/meetings" />} />
          {recent.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{t("overview.noneRecent")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((m) => (
                <li key={m.id}>
                  <Link href={m.status === "live" ? "/" : `/meetings/${m.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-fg/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <bdi>{m.title}</bdi>
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(m.started_at, lng, { dateStyle: "medium" })} · {t("overview.speakers", { count: m.participants.length })}
                      </p>
                    </div>
                    <StatusBadge meeting={m} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={ListTodo} title={t("overview.attention")} action={<ViewAll href="/tasks" />} />
          {attention.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{t("overview.noneTasks")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((x) => (
                <li key={`${x.meeting.id}-${x.id}`} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${x.overdue ? "bg-danger" : "bg-warn"}`} />
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-sm leading-snug">
                      {x.text}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      <bdi>{x.meeting.participants.find((p) => p.id === x.owner_id)?.name ?? x.meeting.title}</bdi>
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs ${x.overdue ? "text-danger" : "text-muted"}`}>
                    {x.due_date ? formatDate(x.due_date, lng, { day: "numeric", month: "short" }) : t("overview.noDue")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Total({ label, value, note = null, warn = false }) {
  return (
    <StaggerItem card>
      <Card className="flex h-full flex-col justify-between p-5">
        <p className="text-sm text-muted">{label}</p>
        <div className="mt-4">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
          {note && <p className={`mt-1 text-xs ${warn ? "text-danger" : "text-muted"}`}>{note}</p>}
        </div>
      </Card>
    </StaggerItem>
  );
}

function ViewAll({ href }) {
  const { t } = useTranslation();
  return (
    <Link href={href} className="text-xs text-muted transition-colors hover:text-fg">
      {t("overview.viewAll")}
    </Link>
  );
}

function LiveClock({ since }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date().toISOString());
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now ? elapsed(since, now) : "00:00:00";
}
