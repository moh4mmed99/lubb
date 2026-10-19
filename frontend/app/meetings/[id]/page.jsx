"use client";

import { Check, Download, FileQuestion, FileText, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, Badge, Button, Card, EmptyState, Loading, Notice, inputClass } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { duration, elapsed, formatDate, mmss, speakingTime } from "@/lib/format";
import { useHub } from "@/lib/useHub";

const newId = () => Math.random().toString(36).slice(2, 14);

export default function MinutesPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const router = useRouter();
  const [meeting, setMeeting] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null); // report being edited
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMeeting(await api(`/meetings/${id}`));
      setError(null);
    } catch (err) {
      if (err.status === 404) setMeeting(null);
      else setError(errorText(err, t));
    }
  }, [id, t]);

  const connected = useHub((e) => {
    if (e.meeting_id === id && ["report_ready", "meeting_ended", "meeting_started"].includes(e.type)) load();
  });

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const printed = useRef(false);
  useEffect(() => {
    if (printed.current || !meeting?.report || meeting.report_pending) return;
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      printed.current = true;
      setTimeout(() => window.print(), 300); // let fonts and layout settle first
    }
  }, [meeting]);

  // Belt and braces: poll while the AI is writing, in case the report_ready event was missed.
  useEffect(() => {
    if (!meeting?.report_pending) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [meeting?.report_pending, load]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const saveReport = (report) =>
    run(async () => {
      const clean = {
        ...report,
        summary: report.summary.map((s) => s.trim()).filter(Boolean),
        decisions: report.decisions.map((d) => ({ ...d, text: d.text.trim() })).filter((d) => d.text),
        tasks: report.tasks.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text),
      };
      const saved = await api(`/meetings/${id}/report`, { method: "PUT", body: clean });
      setMeeting((m) => ({ ...m, report: saved }));
      setDraft(null);
    });

  const generate = () => {
    if (meeting.report && !confirm(t("report.regenerateConfirm"))) return;
    run(async () => setMeeting(await api(`/meetings/${id}/report/generate?language=${meeting.language}`, { method: "POST" })));
  };

  const remove = () => {
    if (!confirm(t("report.deleteConfirm"))) return;
    run(async () => {
      await api(`/meetings/${id}`, { method: "DELETE" });
      router.push("/meetings");
    });
  };

  if (meeting === undefined) {
    return <div className="me-auto max-w-3xl space-y-4 p-4 md:p-8">{error ? <Notice tone="danger">{error}</Notice> : <Loading />}</div>;
  }
  if (meeting === null) {
    return (
      <div className="me-auto max-w-3xl p-4 md:p-8">
        <Card>
          <EmptyState icon={FileQuestion} title={t("report.notFound")}>
            <Link href="/meetings">
              <Button>{t("nav.history")}</Button>
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  }

  const report = meeting.report;
  const editing = draft !== null;
  const shown = draft ?? report;

  return (
    <div className="me-auto max-w-5xl space-y-6 p-4 md:p-8">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <StatusBadge meeting={meeting} />
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button onClick={() => setDraft(null)} disabled={busy}>
                <X size={16} />
                {t("common.cancel")}
              </Button>
              <Button variant="primary" onClick={() => saveReport(draft)} disabled={busy}>
                <Check size={16} />
                {t("common.save")}
              </Button>
            </>
          ) : (
            <>
              {report && (
                <Button onClick={() => window.print()}>
                  <Download size={16} />
                  {t("report.export")}
                </Button>
              )}
              {report && (
                <a href={`/api/meetings/${id}/export/docx`} download>
                  <Button>
                    <FileText size={16} />
                    {t("report.exportWord")}
                  </Button>
                </a>
              )}
              {report && !report.approved && (
                <Button onClick={() => setDraft(structuredClone(report))}>
                  <Pencil size={16} />
                  {t("report.edit")}
                </Button>
              )}
              {meeting.status === "ended" && !meeting.report_pending && !report?.approved && (
                <Button onClick={generate} disabled={busy}>
                  <RefreshCw size={16} />
                  {report ? t("report.regenerate") : t("report.generate")}
                </Button>
              )}
              {report && !report.approved && (
                <Button variant="primary" onClick={() => saveReport({ ...report, approved: true })} disabled={busy}>
                  <Check size={16} />
                  {t("report.approve")}
                </Button>
              )}
              {meeting.status !== "live" && (
                <Button variant="danger" onClick={remove} disabled={busy} aria-label={t("report.delete")} title={t("report.delete")}>
                  <Trash2 size={16} />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {meeting.status === "live" && (
        <Notice tone="warn" action={<Link href="/" className="text-sm font-medium underline">{t("setup.openLive")}</Link>}>
          {t("report.stillLive")}
        </Notice>
      )}

      {/* Document in the wide column, details in a narrow rail beside it (on wide screens) */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <Card className="p-6 md:p-10">
        {/* Title block */}
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{t("report.label")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          <bdi>{meeting.title}</bdi>
        </h1>

        {/* On wide screens these move to the rail; printouts (PDF) always keep them in the document */}
        <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-5 text-sm sm:grid-cols-4 lg:hidden print:grid">
          <Meta label={t("report.date")} value={meeting.started_at ? formatDate(meeting.started_at, lng) : "—"} />
          <Meta
            label={t("report.time")}
            value={
              meeting.started_at
                ? `${formatDate(meeting.started_at, lng, { timeStyle: "short" })} – ${meeting.ended_at ? formatDate(meeting.ended_at, lng, { timeStyle: "short" }) : "…"}`
                : "—"
            }
          />
          <Meta label={t("report.duration")} value={meeting.started_at && meeting.ended_at ? duration(meeting.started_at, meeting.ended_at, lng) : "—"} />
          <Meta label={t("report.attendees")} value={String(meeting.participants.length)} />
        </dl>

        <AgendaCoverage meeting={meeting} />

        {meeting.report_pending ? (
          <div className="flex items-center gap-3 py-12 text-sm text-muted">
            <span className="size-5 animate-spin rounded-full border-2 border-line border-t-fg" />
            {t("report.generatingText")}
          </div>
        ) : !shown ? (
          meeting.status === "ended" && <p className="py-12 text-sm text-muted">{t("report.missingText")}</p>
        ) : (
          <>
            <Section title={t("report.summary")}>
              {editing ? (
                <LinesEditor lines={draft.summary} onChange={(summary) => setDraft({ ...draft, summary })} />
              ) : shown.summary.length ? (
                <ul className="space-y-2.5">
                  {shown.summary.map((s, i) => (
                    <li key={i} className="flex gap-2.5" dir="auto">
                      <span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted" />
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty />
              )}
            </Section>

            <Section title={t("report.decisions")}>
              {editing ? (
                <LinesEditor
                  lines={draft.decisions.map((d) => d.text)}
                  onChange={(lines) => setDraft({ ...draft, decisions: lines.map((text, i) => ({ id: draft.decisions[i]?.id ?? newId(), text })) })}
                />
              ) : shown.decisions.length ? (
                <ol className="space-y-2.5">
                  {shown.decisions.map((d, i) => (
                    <li key={d.id} className="flex gap-3" dir="auto">
                      <span className="mt-0.5 font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      {d.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty />
              )}
            </Section>

            <Section title={t("report.tasks")}>
              {editing ? (
                <TasksEditor tasks={draft.tasks} participants={meeting.participants} onChange={(tasks) => setDraft({ ...draft, tasks })} />
              ) : shown.tasks.length ? (
                <TasksTable
                  report={shown}
                  participants={meeting.participants}
                  onToggle={(taskId, done) => saveReport({ ...report, tasks: report.tasks.map((x) => (x.id === taskId ? { ...x, done } : x)) })}
                  disabled={busy}
                />
              ) : (
                <Empty />
              )}
            </Section>
          </>
        )}

        <SpeakingTime meeting={meeting} />
        <FullTranscript meeting={meeting} />
      </Card>
      <DetailsRail meeting={meeting} lng={lng} />
      </div>
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return <p className="text-sm text-muted">{t("report.none")}</p>;
}

function TasksTable({ report, participants, onToggle, disabled }) {
  const { t } = useTranslation();
  const byId = Object.fromEntries(participants.map((p) => [p.id, p]));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-start text-xs text-muted">
          <th className="w-8 pb-2" />
          <th className="pb-2 text-start font-normal">{t("report.task")}</th>
          <th className="pb-2 text-start font-normal">{t("report.owner")}</th>
          <th className="pb-2 text-end font-normal">{t("report.due")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line border-t border-line">
        {report.tasks.map((task) => (
          <tr key={task.id}>
            <td className="py-3">
              <input
                type="checkbox"
                checked={task.done}
                disabled={disabled}
                onChange={(e) => onToggle(task.id, e.target.checked)}
                className="size-4 accent-[var(--fg)]"
              />
            </td>
            <td className={`py-3 ${task.done ? "text-muted line-through" : ""}`} dir="auto">
              {task.text}
            </td>
            <td className="py-3 text-muted">{task.owner_id ? byId[task.owner_id]?.name : "—"}</td>
            <td className="py-3 text-end font-mono text-xs text-muted">{task.due_date ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Edits a list of short texts: one input per line, add/remove. */
function LinesEditor({ lines, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={inputClass}
            dir="auto"
            value={line}
            onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
          />
          <RemoveButton onClick={() => onChange(lines.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...lines, ""])} label={t("report.addItem")} />
    </div>
  );
}

function TasksEditor({ tasks, participants, onChange }) {
  const { t } = useTranslation();
  const patch = (id, change) => onChange(tasks.map((x) => (x.id === id ? { ...x, ...change } : x)));
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_2rem]">
          <input className={inputClass} dir="auto" value={task.text} placeholder={t("report.task")} onChange={(e) => patch(task.id, { text: e.target.value })} />
          <select className={inputClass} value={task.owner_id ?? ""} onChange={(e) => patch(task.id, { owner_id: e.target.value || null })}>
            <option value="">{t("report.noOwner")}</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={inputClass}
            value={task.due_date ?? ""}
            onChange={(e) => patch(task.id, { due_date: e.target.value || null })}
            dir="ltr"
          />
          <RemoveButton onClick={() => onChange(tasks.filter((x) => x.id !== task.id))} />
        </div>
      ))}
      <AddButton
        onClick={() => onChange([...tasks, { id: newId(), text: "", owner_id: null, due_date: null, done: false }])}
        label={t("report.addTask")}
      />
    </div>
  );
}

function RemoveButton({ onClick }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} aria-label={t("common.remove")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-danger">
      <X size={16} />
    </button>
  );
}

function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
      <Plus size={15} />
      {label}
    </button>
  );
}

/** Each agenda item: discussed or not, with how many contributions and how much talk time it got. */
function AgendaCoverage({ meeting }) {
  const { t } = useTranslation();
  if (!meeting.agenda.length) return null;
  return (
    <Section title={t("report.agenda")}>
      <ol className="divide-y divide-line border-y border-line">
        {meeting.agenda.map((item, i) => {
          const said = meeting.utterances.filter((u) => u.agenda_index === i);
          const secs = said.reduce((sum, u) => sum + (Date.parse(u.ended_at) - Date.parse(u.started_at)) / 1000, 0);
          return (
            <li key={i} className="flex items-center gap-3 py-3">
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <bdi className="flex-1">{item}</bdi>
              {said.length > 0 && (
                <span className="hidden text-xs text-muted sm:inline">
                  {t("report.contributions", { count: said.length })} · <span dir="ltr">{mmss(Math.round(secs))}</span>
                </span>
              )}
              <Badge tone={said.length ? "ok" : "muted"}>{said.length ? t("report.covered") : t("report.skipped")}</Badge>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function SpeakingTime({ meeting }) {
  const { t } = useTranslation();
  const talk = speakingTime(meeting);
  const maxTalk = Math.max(...Object.values(talk), 1);
  return (
    <Section title={t("report.speakingTime")}>
      <ul className="space-y-3">
        {meeting.participants.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <Avatar name={p.name} color={p.color} photo={p.photo} size="sm" />
            <div className="w-28 shrink-0">
              <div className="text-sm">{p.name}</div>
              <div className="text-xs text-muted">{p.title}</div>
            </div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full" style={{ width: `${((talk[p.id] ?? 0) / maxTalk) * 100}%`, backgroundColor: p.color }} />
            </div>
            <span className="w-12 text-end font-mono text-xs text-muted" dir="ltr">
              {mmss(talk[p.id] ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FullTranscript({ meeting }) {
  const { t } = useTranslation();
  const byId = Object.fromEntries(meeting.participants.map((p) => [p.id, p]));
  return (
    <details className="group mt-10 border-t border-line pt-6">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        {t("report.transcript")} <span className="text-muted">({meeting.utterances.length})</span>
      </summary>
      <div className="mt-4 space-y-3 text-sm">
        {meeting.utterances.map((u) => (
          <p key={u.id} dir="auto" className="leading-relaxed">
            <span className="font-mono text-xs text-muted" dir="ltr">
              {elapsed(meeting.started_at, u.started_at)}
            </span>{" "}
            <span className="font-medium">{byId[u.participant_id]?.name}:</span> {u.text}
            {u.slide && (
              <span className="ms-2 whitespace-nowrap rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
                {t("report.onSlide", { n: u.slide.slide })}
              </span>
            )}
          </p>
        ))}
      </div>
    </details>
  );
}

function DetailsRail({ meeting, lng }) {
  const { t } = useTranslation();
  const time = meeting.started_at
    ? `${formatDate(meeting.started_at, lng, { timeStyle: "short" })} – ${meeting.ended_at ? formatDate(meeting.ended_at, lng, { timeStyle: "short" }) : "…"}`
    : "—";
  return (
    <aside className="no-print hidden space-y-6 text-sm lg:sticky lg:top-8 lg:block">
      <span aria-hidden className="block h-1.5 w-12 bg-fg" />
      <dl className="space-y-4">
        <Meta label={t("report.date")} value={meeting.started_at ? formatDate(meeting.started_at, lng, { dateStyle: "full" }) : "—"} />
        <Meta label={t("report.time")} value={time} />
        <Meta label={t("report.duration")} value={meeting.started_at && meeting.ended_at ? duration(meeting.started_at, meeting.ended_at, lng) : "—"} />
      </dl>
      <div>
        <p className="mb-3 text-xs text-muted">
          {t("report.attendees")} · {meeting.participants.length}
        </p>
        <ul className="space-y-2.5">
          {meeting.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5">
              <Avatar name={p.name} color={p.color} photo={p.photo} size="sm" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.is_chair && <span className="text-xs text-muted">{t("common.chair")}</span>}
            </li>
          ))}
        </ul>
      </div>
      {meeting.slides_shown?.length > 0 && <SlidesShown meeting={meeting} />}
    </aside>
  );
}

/** Presentations shown during the meeting, with how many of their slides were put up. */
function SlidesShown({ meeting }) {
  const { t } = useTranslation();
  const decks = {};
  for (const s of meeting.slides_shown) (decks[s.presentation_id] ??= { title: s.title, slides: new Set() }).slides.add(s.slide);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("report.presented")}</p>
      <ul className="space-y-2">
        {Object.entries(decks).map(([id, d]) => (
          <li key={id}>
            <Link href={`/presentations/${id}`} className="hover:underline">
              <bdi>{d.title}</bdi>
            </Link>
            <span className="text-xs text-muted"> · {t("report.slidesShown", { count: d.slides.size })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-10 leading-relaxed">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
