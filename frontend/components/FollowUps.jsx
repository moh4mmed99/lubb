"use client";

// Following up earlier meetings' tasks: picked when a meeting is set up, ticked off while it runs.
import { AlertCircle, CheckCircle2, Circle, ListChecks } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card, CardHeader } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);
const overdue = (task) => !task.done && task.due_date && task.due_date < today();
export const followUpKey = (meetingId, taskId) => `${meetingId}:${taskId}`;

/** Open tasks in the minutes of ended meetings, newest meeting first: [{ meeting, tasks }]. */
export function previousTasks(meetings) {
  return (meetings ?? [])
    .filter((m) => m.status === "ended" && m.report && !m.report_pending)
    .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
    .map((meeting) => ({ meeting, tasks: meeting.report.tasks.filter((x) => !x.done) }))
    .filter((g) => g.tasks.length);
}

/** New meeting: tick the earlier tasks to review in it, one by one or a whole meeting's at once. */
export function FollowUpPicker({ meetings, picked, onChange, language, className = "" }) {
  const { t, i18n } = useTranslation();
  const groups = previousTasks(meetings);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const chosen = groups.reduce((n, g) => n + g.tasks.filter((x) => picked.has(followUpKey(g.meeting.id, x.id))).length, 0);

  const set = (keys, on) => {
    const next = new Set(picked);
    for (const k of keys) on ? next.add(k) : next.delete(k);
    onChange(next);
  };

  return (
    <Card className={className}>
      <CardHeader
        icon={ListChecks}
        title={t("followup.title")}
        action={
          total > 0 && (
            <span className="font-mono text-xs text-muted" dir="ltr">
              {chosen} / {total}
            </span>
          )
        }
      />
      {total === 0 ? (
        <p className="p-5 text-sm text-muted">{t("followup.none")}</p>
      ) : (
        <div className="space-y-4 p-5">
          <p className="text-xs text-muted">{t("followup.hint")}</p>
          <div className="max-h-96 space-y-5 overflow-y-auto">
            {groups.map(({ meeting: m, tasks }) => {
              const people = Object.fromEntries(m.participants.map((p) => [p.id, p.name]));
              const keys = tasks.map((x) => followUpKey(m.id, x.id));
              return (
                <div key={m.id}>
                  {/* the meeting: ticks all its open tasks */}
                  <label className="flex cursor-pointer items-center gap-2.5 border-b border-line pb-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={keys.every((k) => picked.has(k))}
                      onChange={(e) => set(keys, e.target.checked)}
                      className="size-4 shrink-0 accent-[var(--fg)]"
                    />
                    <bdi className="min-w-0 flex-1 truncate">{m.title}</bdi>
                    {m.started_at && (
                      <span className="shrink-0 text-xs font-normal text-muted">{formatDate(m.started_at, i18n.language)}</span>
                    )}
                  </label>
                  <ul>
                    {tasks.map((x) => {
                      const k = followUpKey(m.id, x.id);
                      return (
                        <li key={x.id}>
                          <label className="flex cursor-pointer items-start gap-2.5 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={picked.has(k)}
                              onChange={(e) => set([k], e.target.checked)}
                              className="mt-0.5 size-4 shrink-0 accent-[var(--fg)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span dir="auto" className="block">
                                {x.text}
                              </span>
                              <span className="text-xs text-muted">
                                {people[x.owner_id] ?? t("followup.noOwner")}
                                {x.due_date && " · "}
                                {x.due_date && (
                                  <span className={overdue(x) ? "text-danger" : ""} dir="ltr">
                                    {x.due_date}
                                  </span>
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          {chosen > 0 && (
            <p className="text-xs text-muted">{t("followup.agendaNote", { item: t("followup.agendaItem", { lng: language }) })}</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Live meeting: the tasks being followed up; ticking one marks it done in its own meeting's minutes too. */
export function FollowUpList({ meeting }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(null); // task id being saved
  const [error, setError] = useState(null);

  // The hub tells every dashboard (followup event), which updates the list
  const toggle = async (f) => {
    setSaving(f.task_id);
    setError(null);
    try {
      await api(`/meetings/${meeting.id}/followups/${f.task_id}`, { method: "PUT", body: { done: !f.done } });
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-1">
      {error && <p className="pb-2 text-xs text-danger">{error}</p>}
      <ul className="space-y-1">
        {meeting.followups.map((f) => (
          <li key={f.task_id}>
            <button
              onClick={() => toggle(f)}
              disabled={saving === f.task_id}
              title={f.done ? t("tasks.markOpen") : t("tasks.markDone")}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-start transition hover:bg-subtle disabled:opacity-50"
            >
              {f.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" /> : <Circle size={18} className="mt-0.5 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1">
                <span dir="auto" className={`block ${f.done ? "text-muted line-through" : ""}`}>
                  {f.text}
                </span>
                <span className="text-xs text-muted">
                  {f.owner ?? t("followup.noOwner")} · <bdi>{f.meeting_title}</bdi>
                </span>
              </span>
              {overdue(f) && (
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-danger">
                  <AlertCircle size={13} />
                  {t("followup.overdue")}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
