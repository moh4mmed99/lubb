"use client";

// Follow-up on every task from every meeting's minutes: who, what, by when, from which meeting.
import { AlertCircle, CheckCircle2, Circle, ListTodo, Search } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stagger, StaggerItem, spring } from "@/components/motion";
import { Avatar, Card, EmptyState, Loading, Notice, PageHeader, Segmented, inputClass } from "@/components/ui";
import { api, cached, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useHub } from "@/lib/useHub";

const today = () => new Date().toISOString().slice(0, 10);

function statusOf(task) {
  if (task.done) return "done";
  return task.due_date && task.due_date < today() ? "overdue" : "open";
}

// Overdue first (oldest deadline first), then open by deadline (no deadline last), then done
const RANK = { overdue: 0, open: 1, done: 2 };
const byUrgency = (a, b) =>
  RANK[a.status] - RANK[b.status] || (a.task.due_date ?? "9999").localeCompare(b.task.due_date ?? "9999");

const withTasks = (all) => all?.filter((m) => m.report?.tasks.length) ?? null;

export default function TasksPage() {
  const { t, i18n } = useTranslation();
  const [meetings, setMeetings] = useState(() => withTasks(cached("/meetings")));
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(null); // task id being saved

  const load = useCallback(async () => {
    try {
      setMeetings(withTasks(await api("/meetings")));
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

  // Ticking a task saves that meeting's minutes with the task updated
  const toggle = async (meeting, task) => {
    setSaving(task.id);
    setError(null);
    const report = { ...meeting.report, tasks: meeting.report.tasks.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)) };
    try {
      const saved = await api(`/meetings/${meeting.id}/report`, { method: "PUT", body: report });
      setMeetings((ms) => ms.map((m) => (m.id === meeting.id ? { ...m, report: saved } : m)));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSaving(null);
    }
  };

  const rows = (meetings ?? [])
    .flatMap((m) => {
      const people = Object.fromEntries(m.participants.map((p) => [p.id, p]));
      return m.report.tasks.map((task) => ({ task, meeting: m, owner: people[task.owner_id], status: statusOf(task) }));
    })
    .sort(byUrgency);
  const counts = { all: rows.length, open: 0, overdue: 0, done: 0 };
  rows.forEach((r) => counts[r.status]++);

  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === "all" || r.status === filter || (filter === "open" && r.status === "overdue")) &&
      (!q || [r.task.text, r.owner?.name ?? "", r.meeting.title].some((s) => s.toLowerCase().includes(q))),
  );

  return (
    <div className="space-y-6 page">
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitle")} />
      {error && <Notice tone="danger">{error}</Notice>}

      {meetings === null ? (
        !error && <Loading />
      ) : rows.length === 0 ? (
        <Card className="fill flex flex-col">
          <EmptyState icon={ListTodo} title={t("tasks.noneTitle")} text={t("tasks.noneText")} />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                // "Open" includes overdue ones: both still need doing
                { value: "open", label: `${t("tasks.filter.open")} ${counts.open + counts.overdue}` },
                { value: "overdue", label: `${t("tasks.filter.overdue")} ${counts.overdue}` },
                { value: "done", label: `${t("tasks.filter.done")} ${counts.done}` },
                { value: "all", label: `${t("tasks.filter.all")} ${counts.all}` },
              ]}
            />
            <div className="relative w-full sm:w-64">
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className={`${inputClass} ps-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("tasks.search")} />
            </div>
          </div>

          <Card className="fill">
            {shown.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted">{filter === "overdue" ? t("tasks.noOverdue") : t("history.empty")}</p>
            ) : (
              <Stagger as="ul" className="divide-y divide-line">
                <AnimatePresence>
                {shown.map(({ task, meeting, owner, status }) => (
                  <StaggerItem as="li" key={`${meeting.id}-${task.id}`} className="flex items-center gap-4 px-5 py-3.5">
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      transition={spring}
                      onClick={() => toggle(meeting, task)}
                      disabled={saving === task.id}
                      aria-label={task.done ? t("tasks.markOpen") : t("tasks.markDone")}
                      title={task.done ? t("tasks.markOpen") : t("tasks.markDone")}
                      className={`shrink-0 transition-colors disabled:opacity-40 ${task.done ? "text-ok" : "text-muted hover:text-fg"}`}
                    >
                      {/* the check pops in when a task is done */}
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={task.done ? "done" : "open"}
                          className="block"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                          transition={spring}
                        >
                          {task.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>

                    <div className="min-w-0 flex-1">
                      <p dir="auto" className={`text-sm ${task.done ? "text-muted line-through" : "font-medium"}`}>
                        {task.text}
                      </p>
                      <Link href={`/meetings/${meeting.id}`} className="mt-0.5 block truncate text-xs text-muted hover:text-fg hover:underline">
                        <bdi>{meeting.title}</bdi>
                        {meeting.started_at && ` · ${formatDate(meeting.started_at, i18n.language)}`}
                      </Link>
                    </div>

                    <div className="hidden w-32 shrink-0 items-center gap-2 sm:flex">
                      {owner ? (
                        <>
                          <Avatar name={owner.name} color={owner.color} photo={owner.photo} size="sm" />
                          <span className="truncate text-sm">{owner.name}</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted">{t("report.noOwner")}</span>
                      )}
                    </div>

                    <div className={`w-28 shrink-0 text-end text-xs ${status === "overdue" ? "text-danger" : "text-muted"}`}>
                      {status === "overdue" && <AlertCircle size={13} className="me-1 inline -translate-y-px" />}
                      {task.due_date ? (
                        <span dir="ltr" className="font-mono">
                          {task.due_date}
                        </span>
                      ) : (
                        t("tasks.noDue")
                      )}
                    </div>
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
