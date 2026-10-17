"use client";

import { Archive, ChevronLeft, ChevronRight, PlusCircle, Search, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, EmptyState, Loading, Notice, PageHeader, inputClass } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { duration, formatDate } from "@/lib/format";
import { useHub } from "@/lib/useHub";

/** Search across title, participant names and the transcript. */
function matches(meeting, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [meeting.title, ...meeting.participants.map((p) => p.name), ...meeting.utterances.map((u) => u.text)].some((s) =>
    s.toLowerCase().includes(q),
  );
}

export default function ArchivePage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const Chevron = lng === "ar" ? ChevronLeft : ChevronRight;

  const load = useCallback(async () => {
    try {
      setMeetings(await api("/meetings"));
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  const connected = useHub((e) => {
    if (["meeting_started", "meeting_ended", "report_ready"].includes(e.type)) load();
  });

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const results = meetings?.filter((m) => matches(m, query)) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />
      {error && <Notice tone="danger">{error}</Notice>}

      {meetings === null ? (
        !error && <Loading />
      ) : meetings.length === 0 ? (
        <Card>
          <EmptyState icon={Archive} title={t("history.noneTitle")} text={t("history.noneText")}>
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
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className={`${inputClass} ps-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("history.search")} />
          </div>

          <Card>
            {results.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted">{t("history.empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {results.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={m.status === "live" ? "/" : `/meetings/${m.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition hover:bg-subtle"
                    >
                      <div className="w-12 shrink-0 text-center">
                        {m.started_at ? (
                          <>
                            <div className="text-lg font-semibold leading-none">{formatDate(m.started_at, lng, { day: "numeric" })}</div>
                            <div className="mt-1 text-xs text-muted">{formatDate(m.started_at, lng, { month: "short" })}</div>
                          </>
                        ) : (
                          <div className="text-muted">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          <bdi>{m.title}</bdi>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                          {m.started_at && <span>{formatDate(m.started_at, lng, { timeStyle: "short" })}</span>}
                          {m.started_at && m.ended_at && <span>{duration(m.started_at, m.ended_at, lng)}</span>}
                          <span className="inline-flex items-center gap-1">
                            <Users size={12} /> {m.participants.length}
                          </span>
                        </div>
                      </div>
                      <StatusBadge meeting={m} />
                      <Chevron size={16} className="text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
