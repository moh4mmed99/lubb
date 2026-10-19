"use client";

// Every meeting the AI has written minutes for, with one-click PDF / Word export.
import { FileText, Printer, ScrollText, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stagger, StaggerItem } from "@/components/motion";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, EmptyState, Loading, Notice, PageHeader, inputClass } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { duration, formatDate } from "@/lib/format";
import { useHub } from "@/lib/useHub";

export default function MinutesListPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const all = await api("/meetings");
      // Only finished meetings: those with minutes, or whose minutes are being written right now
      setMeetings(all.filter((m) => m.status === "ended" && (m.report || m.report_pending)));
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  const connected = useHub((e) => {
    if (["meeting_ended", "report_ready"].includes(e.type)) load();
  });
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const q = query.trim().toLowerCase();
  const results = (meetings ?? []).filter(
    (m) => !q || [m.title, ...(m.report?.summary ?? []), ...(m.report?.decisions ?? []).map((d) => d.text)].some((s) => s.toLowerCase().includes(q)),
  );

  return (
    <div className="me-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader title={t("minutes.title")} subtitle={t("minutes.subtitle")} />
      {error && <Notice tone="danger">{error}</Notice>}

      {meetings === null ? (
        !error && <Loading />
      ) : meetings.length === 0 ? (
        <Card>
          <EmptyState icon={ScrollText} title={t("minutes.noneTitle")} text={t("minutes.noneText")} />
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className={`${inputClass} ps-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("minutes.search")} />
          </div>

          {results.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t("history.empty")}</p>
          ) : (
            // The latest minutes lead at full width; older ones fall into two columns beneath
            <Stagger className="grid gap-4 md:grid-cols-2">
              {results.map((m, i) => (
                <StaggerItem key={m.id} className={i === 0 ? "md:col-span-2" : ""}>
                  <MinutesCard meeting={m} lng={lng} featured={i === 0} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}
    </div>
  );
}

function MinutesCard({ meeting: m, lng, featured = false }) {
  const { t } = useTranslation();
  const r = m.report;
  const openTasks = r?.tasks.filter((x) => !x.done).length ?? 0;

  return (
    <Card interactive className="flex h-full flex-col">
      <Link href={`/meetings/${m.id}`} className="flex-1 space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`truncate font-semibold ${featured ? "text-2xl tracking-tight" : "text-lg"}`}>
              <bdi>{m.title}</bdi>
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {m.started_at && formatDate(m.started_at, lng, { dateStyle: "medium" })}
              {m.started_at && m.ended_at && ` · ${duration(m.started_at, m.ended_at, lng)}`}
              {` · ${t("common.participants", { count: m.participants.length })}`}
            </p>
          </div>
          <StatusBadge meeting={m} />
        </div>

        {m.report_pending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="size-4 animate-spin rounded-full border-2 border-line border-t-fg" />
            {t("report.generatingText")}
          </p>
        ) : (
          <>
            {/* What the AI summarised, at a glance */}
            <div className="flex gap-2 text-sm leading-relaxed">
              <Sparkles size={15} className="mt-1 shrink-0 text-accent" />
              <p dir="auto" className={featured ? "line-clamp-4 text-base" : "line-clamp-3"}>
                {r.summary.join(" ") || t("report.none")}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{t("minutes.decisions", { count: r.decisions.length })}</span>
              <span>{t("minutes.tasks", { count: r.tasks.length })}</span>
              {openTasks > 0 && <span className="text-warn">{t("minutes.openTasks", { count: openTasks })}</span>}
            </div>
          </>
        )}
      </Link>

      {r && !m.report_pending && (
        <div className="no-print flex gap-2 border-t border-line p-3">
          <a href={`/meetings/${m.id}?print=1`} target="_blank" rel="noopener" className="flex-1">
            <Button className="w-full">
              <Printer size={15} />
              PDF
            </Button>
          </a>
          <a href={`/api/meetings/${m.id}/export/docx`} download className="flex-1">
            <Button className="w-full">
              <FileText size={15} />
              Word
            </Button>
          </a>
        </div>
      )}
    </Card>
  );
}
