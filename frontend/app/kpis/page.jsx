"use client";

import { AlertCircle, BarChart3, CalendarDays, CheckCircle2, Clock, ListTodo, Maximize2, PlusCircle, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button, Card, CardHeader, EmptyState, Loading, Notice, PageHeader } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { computeKpis } from "@/lib/kpis";
import { useHub } from "@/lib/useHub";

export default function KpisPage() {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setMeetings(await api("/meetings"));
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  // Refresh when a meeting starts/ends or its minutes arrive (tasks change the numbers)
  const connected = useHub((e) => {
    if (["meeting_started", "meeting_ended", "report_ready"].includes(e.type)) load();
  });
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  // "Show on screen": fullscreen for the meeting-room display
  const present = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const kpis = meetings && computeKpis(meetings);

  return (
    <div className="me-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("kpi.title")}
        subtitle={t("kpi.subtitle")}
        actions={
          kpis?.total > 0 && (
            <Button onClick={present}>
              <Maximize2 size={15} />
              {t("kpi.present")}
            </Button>
          )
        }
      />
      {error && <Notice tone="danger">{error}</Notice>}

      {!kpis ? (
        !error && <Loading />
      ) : kpis.total === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title={t("kpi.noneTitle")} text={t("kpi.noneText")}>
            <Link href="/setup">
              <Button variant="primary">
                <PlusCircle size={16} />
                {t("nav.setup")}
              </Button>
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* 5-column grid: the headline KPI (meetings) takes two columns, the other three one each */}
          <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {kpis.tiles.map((k, i) => (
              <StaggerItem key={k.key} className={i === 0 ? "col-span-2" : ""}>
                <StatTile kpi={k} featured={i === 0} />
              </StaggerItem>
            ))}
          </Stagger>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <MeetingsColumns data={kpis.perMonth} />
            <TaskStatus data={kpis.taskStatus} />
          </div>
        </>
      )}
    </div>
  );
}

function formatValue(format, v, lng, t) {
  if (v == null) return "—";
  const n = new Intl.NumberFormat(`${lng}-u-nu-latn`, { maximumFractionDigits: 1 }).format(Math.abs(v));
  if (format === "percent") return `${n}%`;
  if (format === "hours") return `${n} ${t("kpi.hoursUnit")}`;
  return n;
}

function StatTile({ kpi, featured = false }) {
  const { t, i18n } = useTranslation();
  const up = kpi.delta >= 0;
  const good = up === kpi.upIsGood; // color = direction × whether up is good
  const Icon = up ? TrendingUp : TrendingDown;
  // percent tiles cover all finished meetings; count/hours tiles cover this month
  const scope = kpi.format === "percent" ? t("kpi.allTime") : t("kpi.thisMonth");

  return (
    <Card interactive className={`h-full p-5 ${featured ? "border-fg! bg-fg! text-bg" : ""}`}>
      <div className={`text-sm ${featured ? "text-bg/70" : "text-muted"}`}>{t(`kpi.${kpi.key}`)}</div>
      <div className={`mt-2 whitespace-nowrap font-semibold tracking-tight ${featured ? "text-5xl sm:text-6xl" : "text-2xl sm:text-3xl"}`}>
        <bdi>{formatValue(kpi.format, kpi.value, i18n.language, t)}</bdi>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        {kpi.delta != null && kpi.delta !== 0 ? (
          <span className={`inline-flex items-center gap-1 text-xs ${good ? "text-ok" : "text-danger"}`}>
            <Icon size={14} className="rtl:-scale-x-100" />
            <span dir="ltr">
              {up ? "+" : "−"}
              {/* unit lives in the title; only % is kept so "+6%" isn't read as +6 tasks */}
              {formatValue(kpi.format === "percent" ? "percent" : "count", kpi.delta, i18n.language, t)}
            </span>
            <span className={`hidden sm:inline ${featured ? "text-bg/60" : "text-muted"}`}>{t("kpi.vsLast")}</span>
          </span>
        ) : (
          <span className={`text-xs ${featured ? "text-bg/60" : "text-muted"}`}>{scope}</span>
        )}
        <Sparkline values={kpi.trend} />
      </div>
    </Card>
  );
}

/** Trend in the de-emphasis hue; the current (last) point in the accent. Flows with reading direction. */
function Sparkline({ values }) {
  const w = 64;
  const h = 22;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)]);
  const [lx, ly] = pts.at(-1);
  return (
    <svg width={w} height={h} className="shrink-0 rtl:-scale-x-100" aria-hidden>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />
    </svg>
  );
}

/** Meetings per month: one series → one hue. Values on the caps, hover dims the others. */
function MeetingsColumns({ data }) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = max <= 5 ? 1 : 5;
  const ceiling = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: ceiling / step + 1 }, (_, i) => i * step);

  return (
    <Card>
      <CardHeader icon={CalendarDays} title={t("kpi.perMonth")} action={<span className="text-xs text-muted">{t("kpi.meetingsUnit")}</span>} />
      <div className="p-5">
        <div className="relative h-56">
          {/* recessive grid */}
          {ticks.map((v) => (
            <div key={v} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(v / ceiling) * 100}%` }}>
              <span className="w-4 translate-y-1/2 text-end font-mono text-[10px] text-muted">{v}</span>
              <span className={`h-px flex-1 ${v === 0 ? "bg-muted/60" : "bg-line"}`} />
            </div>
          ))}
          <div className="absolute inset-y-0 end-0 start-6 flex items-end justify-around" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div key={d.month} className="flex h-full w-full flex-col items-center justify-end" onMouseEnter={() => setHover(i)}>
                {d.value > 0 && <span className="mb-1.5 font-mono text-xs tabular-nums">{d.value}</span>}
                <div
                  className="w-6 rounded-t-[4px] bg-accent transition-opacity"
                  style={{ height: `${(d.value / ceiling) * 100}%`, opacity: hover !== null && hover !== i ? 0.4 : 1 }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="ms-6 mt-2 flex justify-around text-xs text-muted">
          {data.map((d) => (
            <span key={d.month}>{formatDate(`${d.month}T00:00:00`, i18n.language, { month: "short" })}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}

const STATUS = {
  done: { color: "#0ca30c", icon: CheckCircle2 },
  open: { color: "var(--line-strong)", icon: Clock }, // neutral, not a status hue
  overdue: { color: "#d03b3b", icon: AlertCircle },
};

/** Part-to-whole as one stacked bar (not a donut); the list below doubles as the table view. */
function TaskStatus({ data }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(null);
  const total = data.reduce((sum, s) => sum + s.count, 0);
  const shown = data.filter((s) => s.count > 0);

  return (
    <Card>
      <CardHeader icon={ListTodo} title={t("kpi.tasks")} action={<span className="text-xs text-muted">{t("kpi.taskTotal", { count: total })}</span>} />
      {total === 0 ? (
        <p className="p-5 text-sm text-muted">{t("kpi.noTasks")}</p>
      ) : (
        <div className="space-y-6 p-5">
          <div className="flex h-6 gap-[2px]" onMouseLeave={() => setHover(null)}>
            {shown.map((s) => (
              <div
                key={s.key}
                onMouseEnter={() => setHover(s.key)}
                title={`${t(`kpi.status.${s.key}`)} · ${s.count}`}
                className="h-full transition-opacity first:rounded-s-[4px] last:rounded-e-[4px]"
                style={{ width: `${(s.count / total) * 100}%`, backgroundColor: STATUS[s.key].color, opacity: hover && hover !== s.key ? 0.35 : 1 }}
              />
            ))}
          </div>
          <ul className="divide-y divide-line text-sm">
            {data.map((s) => {
              const Icon = STATUS[s.key].icon;
              return (
                <li
                  key={s.key}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex items-center gap-3 py-2.5 transition ${hover && hover !== s.key ? "opacity-50" : ""}`}
                >
                  <Icon size={16} style={{ color: STATUS[s.key].color }} />
                  <span className="flex-1">{t(`kpi.status.${s.key}`)}</span>
                  <span className="font-mono text-muted tabular-nums">{s.count}</span>
                  <span className="w-10 text-end font-mono tabular-nums" dir="ltr">
                    {Math.round((s.count / total) * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
