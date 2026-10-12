import { Plus, Star, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Avatar, Button, Card, CardHeader, Field, PageHeader, Segmented, inputClass } from "../components/ui";
import { SPEAKER_COLORS } from "../lib/format";
import { mockMeeting } from "../mocks/meeting";
import type { FloorMode, Language, Participant } from "../types";

const MAX_PARTICIPANTS = 20;
const BUTTONS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => `btn-${i + 1}`);

export function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [language, setLanguage] = useState<Language>("ar");
  const [floorMode, setFloorMode] = useState<FloorMode>("one_at_a_time");
  const [agenda, setAgenda] = useState<string[]>(mockMeeting.agenda);
  const [agendaDraft, setAgendaDraft] = useState("");
  const [participants, setParticipants] = useState<Participant[]>(mockMeeting.participants.slice(0, 4));

  const update = (id: string, patch: Partial<Participant>) =>
    setParticipants((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addParticipant = () => {
    const used = new Set(participants.map((p) => p.device_id));
    const n = participants.length;
    setParticipants((ps) => [
      ...ps,
      { id: Math.random().toString(36).slice(2), name: "", device_id: BUTTONS.find((b) => !used.has(b)), color: SPEAKER_COLORS[n % 20] },
    ]);
  };

  const setChair = (id: string) => setParticipants((ps) => ps.map((p) => ({ ...p, is_chair: p.id === id })));

  const start = async () => {
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || t("setup.meetingTitlePh"), agenda, language, floor_mode: floorMode, participants }),
      });
      const meeting = await res.json();
      await fetch(`/api/meetings/${meeting.id}/start`, { method: "POST" });
    } catch {
      /* hub not running — continue with sample data */
    }
    navigate("/");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("setup.title")}
        subtitle={t("setup.subtitle")}
        actions={
          <Button variant="primary" onClick={start} disabled={!participants.some((p) => p.name)}>
            {t("setup.start")}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Details */}
        <Card>
          <CardHeader title={t("setup.details")} />
          <div className="space-y-5 p-5">
            <Field label={t("setup.meetingTitle")}>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("setup.meetingTitlePh")} />
            </Field>
            <Field label={t("setup.date")}>
              <input type="datetime-local" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
            </Field>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">{t("setup.language")}</span>
              <div>
                <Segmented<Language>
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: "ar", label: "العربية" },
                    { value: "en", label: "English" },
                  ]}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">{t("setup.floorMode")}</span>
              <div>
                <Segmented<FloorMode>
                  value={floorMode}
                  onChange={setFloorMode}
                  options={(["free", "one_at_a_time", "queue"] as const).map((m) => ({ value: m, label: t(`setup.floor.${m}`) }))}
                />
              </div>
              <p className="text-xs text-muted">{t(`setup.floorHint.${floorMode}`)}</p>
            </div>

            <div className="space-y-2 border-t border-line pt-5">
              <span className="text-xs font-medium text-muted">{t("setup.agenda")}</span>
              <ol className="space-y-1">
                {agenda.map((item, i) => (
                  <li key={i} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm">
                    <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">{item}</span>
                    <button
                      onClick={() => setAgenda((a) => a.filter((_, j) => j !== i))}
                      className="text-muted opacity-0 transition group-hover:opacity-100 hover:text-fg"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ol>
              <input
                className={inputClass}
                value={agendaDraft}
                placeholder={t("setup.agendaPh")}
                onChange={(e) => setAgendaDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && agendaDraft.trim()) {
                    setAgenda((a) => [...a, agendaDraft.trim()]);
                    setAgendaDraft("");
                  }
                }}
              />
            </div>
          </div>
        </Card>

        {/* Participants */}
        <Card>
          <CardHeader
            title={t("setup.participants")}
            action={
              <span className="font-mono text-xs text-muted" dir="ltr">
                {participants.length} / {MAX_PARTICIPANTS}
              </span>
            }
          />
          <div className="hidden grid-cols-[2rem_1fr_1fr_6.5rem_2rem_1.5rem] gap-3 px-5 pt-4 text-xs text-muted sm:grid">
            <span />
            <span>{t("setup.name")}</span>
            <span>{t("setup.role")}</span>
            <span>{t("setup.button")}</span>
            <span />
            <span />
          </div>
          <ul className="divide-y divide-line px-5 sm:divide-y-0">
            {participants.map((p) => (
              <li key={p.id} className="grid grid-cols-[2rem_1fr_1.5rem] items-center gap-3 py-3 sm:grid-cols-[2rem_1fr_1fr_6.5rem_2rem_1.5rem] sm:py-2">
                <Avatar name={p.name || "?"} color={p.color} size="sm" />
                <input className={inputClass} value={p.name} placeholder={t("setup.name")} onChange={(e) => update(p.id, { name: e.target.value })} />
                <input
                  className={`${inputClass} col-start-2 sm:col-start-auto`}
                  value={p.title ?? ""}
                  placeholder={t("setup.role")}
                  onChange={(e) => update(p.id, { title: e.target.value })}
                />
                <select
                  className={`${inputClass} col-start-2 sm:col-start-auto`}
                  value={p.device_id ?? ""}
                  onChange={(e) => update(p.id, { device_id: e.target.value })}
                  dir="ltr"
                >
                  {BUTTONS.map((b) => (
                    <option key={b} disabled={b !== p.device_id && participants.some((o) => o.device_id === b)}>
                      {b}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setChair(p.id)}
                  title={t("common.chair")}
                  className={`col-start-3 row-start-1 grid place-items-center sm:col-start-auto sm:row-start-auto ${p.is_chair ? "text-amber-500" : "text-line hover:text-muted"}`}
                >
                  <Star size={17} fill={p.is_chair ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => setParticipants((ps) => ps.filter((o) => o.id !== p.id))}
                  className="col-start-3 row-start-2 grid place-items-center text-muted hover:text-danger sm:col-start-auto sm:row-start-auto"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="p-5 pt-3">
            <Button onClick={addParticipant} disabled={participants.length >= MAX_PARTICIPANTS} className="w-full border-dashed">
              <Plus size={16} />
              {t("setup.add")}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
