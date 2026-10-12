import { Check, Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Badge, Button, Card } from "../components/ui";
import { duration, elapsed, formatDate, mmss, speakingTime } from "../lib/format";
import { mockMeeting } from "../mocks/meeting";

export function Report() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const meeting = mockMeeting; // TODO: load by id from GET /api/meetings/{id}
  const report = meeting.report!;
  const [approved, setApproved] = useState(report.approved);
  const [done, setDone] = useState(() => Object.fromEntries(report.tasks.map((x) => [x.id, x.done])));

  const byId = Object.fromEntries(meeting.participants.map((p) => [p.id, p]));
  const talk = speakingTime(meeting);
  const maxTalk = Math.max(...Object.values(talk), 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Badge tone={approved ? "ok" : "muted"}>{approved ? t("report.approved") : t("report.draft")}</Badge>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>
            <Download size={16} />
            {t("report.export")}
          </Button>
          {!approved && (
            <Button variant="primary" onClick={() => setApproved(true)}>
              <Check size={16} />
              {t("report.approve")}
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6 md:p-10">
        {/* Title block */}
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{t("report.label")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{meeting.title}</h1>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-5 text-sm sm:grid-cols-4">
          <Meta label={t("report.date")} value={formatDate(meeting.started_at!, lng)} />
          <Meta
            label={t("report.time")}
            value={`${formatDate(meeting.started_at!, lng, { timeStyle: "short" })} – ${formatDate(meeting.ended_at!, lng, { timeStyle: "short" })}`}
          />
          <Meta label={t("report.duration")} value={duration(meeting.started_at!, meeting.ended_at!, lng)} />
          <Meta label={t("report.attendees")} value={String(meeting.participants.length)} />
        </dl>

        <Section title={t("report.summary")}>
          <ul className="space-y-2.5">
            {report.summary.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted" />
                {s}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("report.decisions")}>
          <ol className="space-y-2.5">
            {report.decisions.map((d, i) => (
              <li key={d.id} className="flex gap-3">
                <span className="mt-0.5 font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                {d.text}
              </li>
            ))}
          </ol>
        </Section>

        <Section title={t("report.tasks")}>
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
                      checked={done[task.id]}
                      onChange={(e) => setDone((d) => ({ ...d, [task.id]: e.target.checked }))}
                      className="size-4 accent-[var(--fg)]"
                    />
                  </td>
                  <td className={`py-3 ${done[task.id] ? "text-muted line-through" : ""}`}>{task.text}</td>
                  <td className="py-3 text-muted">{task.owner_id ? byId[task.owner_id]?.name : "—"}</td>
                  <td className="py-3 text-end font-mono text-xs text-muted">{task.due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("report.speakingTime")}>
          <ul className="space-y-3">
            {meeting.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Avatar name={p.name} color={p.color} size="sm" />
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

        <details className="group mt-10 border-t border-line pt-6">
          <summary className="cursor-pointer list-none text-sm font-semibold">
            {t("report.transcript")} <span className="text-muted">({meeting.utterances.length})</span>
          </summary>
          <div className="mt-4 space-y-3 text-sm">
            {meeting.utterances.map((u) => (
              <p key={u.id} dir="auto" className="leading-relaxed">
                <span className="font-mono text-xs text-muted" dir="ltr">
                  {elapsed(meeting.started_at!, u.started_at)}
                </span>{" "}
                <span className="font-medium">{byId[u.participant_id]?.name}:</span> {u.text}
              </p>
            ))}
          </div>
        </details>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 leading-relaxed">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
