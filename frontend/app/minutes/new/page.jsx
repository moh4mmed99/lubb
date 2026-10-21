"use client";

// Manual minutes: for a meeting held without LUBB (nothing recorded). Enter its details here; it's saved as an
// ended meeting with empty minutes, and the minutes editor opens to write them.
import { CalendarDays, Plus, Star, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CardHeader, Field, inputClass, Notice, PageHeader, Segmented } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { SPEAKER_COLORS } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
let next = 0;
const attendee = () => ({ key: next++, name: "", title: "", is_chair: false, color: SPEAKER_COLORS[next % SPEAKER_COLORS.length] });

export default function ManualMinutesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [language, setLanguage] = useState("ar");
  const [agenda, setAgenda] = useState([]);
  const [agendaDraft, setAgendaDraft] = useState("");
  const [people, setPeople] = useState(() => [attendee()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const update = (key, change) => setPeople((ps) => ps.map((p) => (p.key === key ? { ...p, ...change } : p)));
  const setChair = (key) => setPeople((ps) => ps.map((p) => ({ ...p, is_chair: p.key === key ? !p.is_chair : false })));
  const addAgendaItem = () => {
    if (!agendaDraft.trim()) return;
    setAgenda((a) => [...a, agendaDraft.trim()]);
    setAgendaDraft("");
  };

  const timesOk = from && to && to >= from;
  const canCreate = title.trim() && date && timesOk && !saving;

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      const meeting = await api("/meetings/manual", {
        method: "POST",
        body: {
          title: title.trim(),
          started_at: `${date}T${from}:00`,
          ended_at: `${date}T${to}:00`,
          language,
          agenda: agendaDraft.trim() ? [...agenda, agendaDraft.trim()] : agenda,
          participants: people.filter((p) => p.name.trim()).map(({ key: _key, ...p }) => ({ ...p, title: p.title.trim() || null })),
        },
      });
      router.push(`/meetings/${meeting.id}?edit=1`); // straight into the minutes editor
    } catch (err) {
      setError(errorText(err, t));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 page">
      <PageHeader
        title={t("manual.title")}
        subtitle={t("manual.subtitle")}
        actions={
          <Button variant="primary" onClick={create} disabled={!canCreate}>
            {saving ? t("manual.creating") : t("manual.create")}
          </Button>
        }
      />
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="fill grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* When and what */}
        <Card>
          <CardHeader icon={CalendarDays} title={t("setup.details")} />
          <div className="space-y-5 p-5">
            <Field label={t("setup.meetingTitle")}>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("setup.meetingTitlePh")} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("manual.date")}>
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t("manual.from")}>
                <input type="time" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={t("manual.to")}>
                <input type="time" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            {!timesOk && <p className="-mt-3 text-xs text-danger">{t("manual.timesInvalid")}</p>}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">{t("setup.language")}</span>
              <div>
                <Segmented
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: "ar", label: "العربية" },
                    { value: "en", label: "English" },
                  ]}
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-line pt-5">
              <span className="text-xs font-medium text-muted">{t("setup.agenda")}</span>
              {agenda.length > 0 && (
                <ol className="space-y-1">
                  {agenda.map((item, i) => (
                    <li key={i} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm">
                      <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1">{item}</span>
                      <button
                        onClick={() => setAgenda((a) => a.filter((_, j) => j !== i))}
                        aria-label={t("common.remove")}
                        className="text-muted transition hover:text-fg sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <input
                className={inputClass}
                value={agendaDraft}
                placeholder={t("setup.agendaPh")}
                onChange={(e) => setAgendaDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAgendaItem();
                  }
                }}
              />
            </div>
          </div>
        </Card>

        {/* Who attended: names only, no buttons (nothing was recorded) */}
        <Card>
          <CardHeader icon={Users} title={t("manual.attendees")} />
          <div className="hidden grid-cols-[1fr_1fr_2rem_1.5rem] gap-3 px-5 pt-4 text-xs text-muted sm:grid">
            <span>{t("setup.name")}</span>
            <span>{t("setup.role")}</span>
            <span />
            <span />
          </div>
          <ul className="divide-y divide-line px-5 sm:divide-y-0">
            {people.map((p) => (
              <li key={p.key} className="grid grid-cols-[1fr_2rem_1.5rem] items-center gap-3 py-3 sm:grid-cols-[1fr_1fr_2rem_1.5rem] sm:py-2">
                <input className={inputClass} value={p.name} placeholder={t("setup.name")} onChange={(e) => update(p.key, { name: e.target.value })} />
                <input
                  className={`${inputClass} col-start-1 sm:col-start-auto`}
                  value={p.title}
                  placeholder={t("setup.role")}
                  onChange={(e) => update(p.key, { title: e.target.value })}
                />
                <button
                  onClick={() => setChair(p.key)}
                  title={t("common.chair")}
                  aria-label={t("common.chair")}
                  className={`col-start-2 row-start-1 grid place-items-center sm:col-start-auto sm:row-start-auto ${p.is_chair ? "text-amber-500" : "text-line hover:text-muted"}`}
                >
                  <Star size={17} fill={p.is_chair ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => setPeople((ps) => ps.filter((x) => x.key !== p.key))}
                  disabled={people.length === 1}
                  aria-label={t("common.remove")}
                  className="col-start-3 row-start-1 grid place-items-center text-muted transition hover:text-danger disabled:invisible sm:col-start-auto sm:row-start-auto"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="p-5 pt-3">
            <button
              onClick={() => setPeople((ps) => [...ps, attendee()])}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-2.5 text-sm text-muted transition hover:border-fg hover:text-fg"
            >
              <Plus size={15} />
              {t("manual.addAttendee")}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
