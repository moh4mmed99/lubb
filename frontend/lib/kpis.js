// Meeting KPIs computed from the hub's saved meetings (GET /api/meetings). Pure functions, no I/O.

const MONTHS = 6;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The last MONTHS month keys, oldest first, ending with the current month. */
export function recentMonths(now = new Date()) {
  return Array.from({ length: MONTHS }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1)));
}

const hours = (m) => (m.started_at && m.ended_at ? (Date.parse(m.ended_at) - Date.parse(m.started_at)) / 3_600_000 : 0);
const tasksOf = (meetings) => meetings.flatMap((m) => m.report?.tasks ?? []);

/** Share of agenda items that got at least one contribution, or null if no agenda. */
function coverage(meetings) {
  let items = 0;
  let covered = 0;
  for (const m of meetings) {
    items += m.agenda.length;
    const said = new Set(m.utterances.map((u) => u.agenda_index));
    covered += m.agenda.filter((_, i) => said.has(i)).length;
  }
  return items ? Math.round((covered / items) * 100) : null;
}

function completion(meetings) {
  const tasks = tasksOf(meetings);
  return tasks.length ? Math.round((tasks.filter((x) => x.done).length / tasks.length) * 100) : null;
}

const METRICS = {
  meetings: { format: "count", upIsGood: true, of: (ms) => ms.length },
  hours: { format: "hours", upIsGood: false, of: (ms) => Math.round(ms.reduce((s, m) => s + hours(m), 0) * 10) / 10 },
  taskCompletion: { format: "percent", upIsGood: true, of: completion },
  agendaCoverage: { format: "percent", upIsGood: true, of: coverage },
};

export function computeKpis(allMeetings, now = new Date()) {
  const held = allMeetings.filter((m) => m.started_at);
  const months = recentMonths(now);
  const byMonth = Object.fromEntries(months.map((k) => [k, []]));
  for (const m of held) byMonth[monthKey(new Date(m.started_at))]?.push(m);

  const ended = held.filter((m) => m.status === "ended");
  const endedByMonth = Object.fromEntries(months.map((k) => [k, byMonth[k].filter((m) => m.status === "ended")]));
  const prev = months.at(-2);

  const tiles = Object.entries(METRICS).map(([key, def]) => {
    // Counting meetings includes the live one; everything else needs a finished meeting.
    const source = key === "meetings" ? byMonth : endedByMonth;
    const trend = months.map((k) => def.of(source[k]));
    const allTime = def.format === "percent";
    const value = allTime ? def.of(ended) : trend.at(-1);
    const delta = !allTime && source[prev].length ? trend.at(-1) - trend.at(-2) : null;
    return { key, ...def, value, delta, trend: trend.map((v) => v ?? 0) };
  });

  const today = now.toISOString().slice(0, 10);
  const tasks = tasksOf(ended);
  const taskStatus = [
    { key: "done", count: tasks.filter((x) => x.done).length },
    { key: "open", count: tasks.filter((x) => !x.done && !(x.due_date && x.due_date < today)).length },
    { key: "overdue", count: tasks.filter((x) => !x.done && x.due_date && x.due_date < today).length },
  ];

  return {
    total: held.length,
    tiles,
    perMonth: months.map((k) => ({ month: `${k}-01`, value: byMonth[k].length })),
    taskStatus,
  };
}
