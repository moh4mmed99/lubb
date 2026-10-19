"use client";

import { Archive, ChevronLeft, ChevronRight, PlusCircle, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion";
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

  const [busy, setBusy] = useState(false);

  const remove = async (meeting) => {
    if (!confirm(t("history.deleteOne", { title: meeting.title }))) return;
    setBusy(true);
    try {
      await api(`/meetings/${meeting.id}`, { method: "DELETE" });
      setMeetings((ms) => ms.filter((m) => m.id !== meeting.id));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    const count = meetings.filter((m) => m.status !== "live").length;
    if (!confirm(t("history.deleteAllConfirm", { count }))) return;
    setBusy(true);
    try {
      await api("/meetings", { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const results = meetings?.filter((m) => matches(m, query)) ?? [];
  const deletable = meetings?.some((m) => m.status !== "live");

  return (
    <div className="me-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("history.title")}
        subtitle={t("history.subtitle")}
        actions={
          // Always shown so it's easy to find; disabled while there's nothing (finished) to delete
          <Button variant="danger" onClick={removeAll} disabled={busy || !deletable} title={deletable ? undefined : t("history.nothingToDelete")}>
            <Trash2 size={15} />
            {t("history.deleteAll")}
          </Button>
        }
      />
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
              <Stagger as="ul" className="divide-y divide-line">
                <AnimatePresence>
                {results.map((m) => (
                  <StaggerItem as="li" key={m.id} className="group flex items-center transition-colors hover:bg-subtle">
                    <Link href={m.status === "live" ? "/" : `/meetings/${m.id}`} className="flex min-w-0 flex-1 items-center gap-4 py-4 ps-5">
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
                      {/* nudges toward the meeting on hover, in reading direction */}
                      <Chevron size={16} className="text-muted transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                    </Link>
                    {/* the live meeting must be ended before it can be deleted */}
                    <button
                      onClick={() => remove(m)}
                      disabled={busy || m.status === "live"}
                      aria-label={t("history.delete")}
                      title={t("history.delete")}
                      className="mx-3 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-card hover:text-danger disabled:invisible sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </StaggerItem>
                ))}
                </AnimatePresence>
              </Stagger>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
