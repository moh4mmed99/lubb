"use client";

// "Stats" tab of the live side panel: headline numbers + two ranked bar lists.
// One series per chart, so bars use a single hue (accent); identity comes from the avatar/label, not color.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { mmss } from "@/lib/format";
import { Avatar } from "./ui";

const secs = (u) => Math.max(0, (Date.parse(u.ended_at) - Date.parse(u.started_at)) / 1000);

export function MeetingStats({ meeting }) {
  const { t } = useTranslation();
  const utterances = meeting.utterances;

  if (!utterances.length) return <p className="text-sm text-muted">{t("stats.empty")}</p>;

  const total = utterances.reduce((sum, u) => sum + secs(u), 0);
  const speakers = meeting.participants
    .map((p) => {
      const mine = utterances.filter((u) => u.participant_id === p.id);
      return { p, seconds: mine.reduce((sum, u) => sum + secs(u), 0), count: mine.length };
    })
    .sort((a, b) => b.seconds - a.seconds);
  const items = meeting.agenda.map((label, i) => {
    const mine = utterances.filter((u) => u.agenda_index === i);
    return { i, label, seconds: mine.reduce((sum, u) => sum + secs(u), 0), count: mine.length };
  });

  return (
    <div className="space-y-7">
      {/* Headline numbers — not charts */}
      <dl className="grid grid-cols-3 gap-2">
        <Tile label={t("stats.talkTime")} value={mmss(Math.round(total))} />
        <Tile label={t("stats.contributions")} value={String(utterances.length)} />
        <Tile label={t("stats.speakers")} value={`${speakers.filter((s) => s.count).length}/${meeting.participants.length}`} />
      </dl>

      <BarList
        title={t("stats.bySpeaker")}
        total={total}
        rows={speakers.map((s) => ({
          key: s.p.id,
          label: s.p.name,
          lead: <Avatar name={s.p.name} color={s.p.color} photo={s.p.photo} size="sm" />,
          seconds: s.seconds,
          count: s.count,
        }))}
      />

      {items.length > 0 && (
        <BarList
          title={t("stats.byAgenda")}
          total={total}
          rows={items.map((it) => ({
            key: String(it.i),
            label: it.label,
            lead: <span className="w-5 text-center font-mono text-xs text-muted">{it.i + 1}</span>,
            seconds: it.seconds,
            count: it.count,
            note: it.i === meeting.agenda_index ? t("live.now") : undefined,
          }))}
        />
      )}
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2.5">
      <dd className="font-mono text-lg font-semibold tabular-nums" dir="ltr">
        {value}
      </dd>
      <dt className="mt-0.5 text-[11px] text-muted">{label}</dt>
    </div>
  );
}

/** Horizontal bars sharing one baseline (the start edge). Hovering a row swaps its value for share + count. */
function BarList({ title, rows, total }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map((r) => r.seconds), 1);

  return (
    <section>
      <h3 className="mb-3 text-xs font-medium text-muted">{title}</h3>
      <ul className="space-y-2.5" onMouseLeave={() => setHover(null)}>
        {rows.map((r) => {
          const share = total ? Math.round((r.seconds / total) * 100) : 0;
          const active = hover === r.key;
          return (
            <li key={r.key} onMouseEnter={() => setHover(r.key)} className={`-mx-2 rounded-md px-2 py-1 transition ${active ? "bg-subtle" : ""}`}>
              <div className="flex items-center gap-2.5">
                {r.lead}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">
                      <bdi>{r.label}</bdi>
                      {r.note && <span className="ms-1.5 text-accent">· {r.note}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-muted tabular-nums" dir="ltr">
                      {active ? `${share}% · ${t("stats.times", { count: r.count })}` : mmss(Math.round(r.seconds))}
                    </span>
                  </div>
                  {/* baseline on the start edge; 4px rounded data-end, square at the baseline */}
                  <div className="mt-1.5 h-2 border-s border-line">
                    {r.seconds > 0 && (
                      <div
                        className="h-full rounded-e-[4px] bg-accent transition-[width] duration-500"
                        style={{ width: `${(r.seconds / max) * 100}%`, opacity: hover && !active ? 0.45 : 1 }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
