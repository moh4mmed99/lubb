"use client";

import { Plus, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Button, Card, CardHeader, Field, Notice, PageHeader, Segmented, inputClass } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { BUTTONS, SPEAKER_COLORS } from "@/lib/format";
import { useHub } from "@/lib/useHub";

const MAX_PARTICIPANTS = BUTTONS.length;

const newParticipant = (used, n) => ({
  key: Math.random().toString(36).slice(2), // not crypto.randomUUID: that needs HTTPS, and phones use plain http
  name: "",
  title: "",
  device_id: BUTTONS.find((b) => !used.has(b)) ?? null,
  color: SPEAKER_COLORS[n % SPEAKER_COLORS.length],
  is_chair: n === 0,
});

export default function SetupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("ar");
  const [floorMode, setFloorMode] = useState("one_at_a_time");
  const [agenda, setAgenda] = useState([]);
  const [agendaDraft, setAgendaDraft] = useState("");
  const [participants, setParticipants] = useState(() => [newParticipant(new Set(), 0)]);
  const [online, setOnline] = useState(new Set());
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [devs, all] = await Promise.all([api("/devices"), api("/meetings")]);
      setOnline(new Set(devs.map((d) => d.device_id)));
      setLive(all.find((m) => m.status === "live") ?? null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  const connected = useHub((e) => {
    if (e.type === "device_connected") setOnline((s) => new Set(s).add(e.device_id));
    if (e.type === "device_disconnected")
      setOnline((s) => {
        const next = new Set(s);
        next.delete(e.device_id);
        return next;
      });
    if (e.type === "meeting_started" || e.type === "meeting_ended") load();
  });

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const update = (key, patch) => setParticipants((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const addParticipant = () =>
    setParticipants((ps) => [...ps, newParticipant(new Set(ps.map((p) => p.device_id)), ps.length)]);
  const setChair = (key) => setParticipants((ps) => ps.map((p) => ({ ...p, is_chair: p.key === key })));
  const addAgendaItem = () => {
    if (!agendaDraft.trim()) return;
    setAgenda((a) => [...a, agendaDraft.trim()]);
    setAgendaDraft("");
  };

  const named = participants.filter((p) => p.name.trim());
  const canStart = title.trim() && named.length > 0 && !live && !saving;

  const start = async () => {
    setSaving(true);
    setError(null);
    try {
      const meeting = await api("/meetings", {
        method: "POST",
        body: {
          title: title.trim(),
          agenda: agendaDraft.trim() ? [...agenda, agendaDraft.trim()] : agenda,
          language,
          floor_mode: floorMode,
          participants: named.map(({ key: _key, ...p }) => ({ ...p, name: p.name.trim(), title: p.title.trim() || null })),
        },
      });
      await api(`/meetings/${meeting.id}/start`, { method: "POST" });
      router.push("/");
    } catch (err) {
      setError(errorText(err, t));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("setup.title")}
        subtitle={t("setup.subtitle")}
        actions={
          <Button variant="primary" onClick={start} disabled={!canStart}>
            {saving ? t("setup.starting") : t("setup.start")}
          </Button>
        }
      />

      {!connected && <Notice tone="danger">{t("common.hubDown")}</Notice>}
      {live && (
        <Notice
          tone="warn"
          action={
            <Link href="/" className="text-sm font-medium underline">
              {t("setup.openLive")}
            </Link>
          }
        >
          {t("setup.alreadyLive", { title: live.title })}
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Details */}
        <Card>
          <CardHeader title={t("setup.details")} />
          <div className="space-y-5 p-5">
            <Field label={t("setup.meetingTitle")}>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("setup.meetingTitlePh")} />
            </Field>
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
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">{t("setup.floorMode")}</span>
              <div>
                <Segmented
                  value={floorMode}
                  onChange={setFloorMode}
                  options={["free", "one_at_a_time", "queue"].map((m) => ({ value: m, label: t(`setup.floor.${m}`) }))}
                />
              </div>
              <p className="text-xs text-muted">{t(`setup.floorHint.${floorMode}`)}</p>
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
          <div className="hidden grid-cols-[2rem_1fr_1fr_7.5rem_2rem_1.5rem] gap-3 px-5 pt-4 text-xs text-muted sm:grid">
            <span />
            <span>{t("setup.name")}</span>
            <span>{t("setup.role")}</span>
            <span>{t("setup.button")}</span>
            <span />
            <span />
          </div>
          <ul className="divide-y divide-line px-5 sm:divide-y-0">
            {participants.map((p) => (
              <li key={p.key} className="grid grid-cols-[2rem_1fr_1.5rem] items-center gap-3 py-3 sm:grid-cols-[2rem_1fr_1fr_7.5rem_2rem_1.5rem] sm:py-2">
                <Avatar name={p.name || "?"} color={p.color} size="sm" />
                <input className={inputClass} value={p.name} placeholder={t("setup.name")} onChange={(e) => update(p.key, { name: e.target.value })} />
                <input
                  className={`${inputClass} col-start-2 sm:col-start-auto`}
                  value={p.title}
                  placeholder={t("setup.role")}
                  onChange={(e) => update(p.key, { title: e.target.value })}
                />
                <div className="relative col-start-2 sm:col-start-auto">
                  <select
                    className={`${inputClass} pe-6`}
                    value={p.device_id ?? ""}
                    onChange={(e) => update(p.key, { device_id: e.target.value || null })}
                    dir="ltr"
                  >
                    <option value="">—</option>
                    {BUTTONS.map((b) => (
                      <option key={b} value={b} disabled={b !== p.device_id && participants.some((o) => o.device_id === b)}>
                        {b}
                        {online.has(b) ? " ●" : ""}
                      </option>
                    ))}
                  </select>
                  <span
                    title={online.has(p.device_id) ? t("setup.buttonOnline") : t("setup.buttonOffline")}
                    className={`pointer-events-none absolute end-2 top-1/2 size-2 -translate-y-1/2 rounded-full ${
                      online.has(p.device_id) ? "bg-ok" : "bg-line"
                    }`}
                  />
                </div>
                <button
                  onClick={() => setChair(p.key)}
                  title={t("common.chair")}
                  className={`col-start-3 row-start-1 grid place-items-center sm:col-start-auto sm:row-start-auto ${p.is_chair ? "text-amber-500" : "text-line hover:text-muted"}`}
                >
                  <Star size={17} fill={p.is_chair ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => setParticipants((ps) => ps.filter((o) => o.key !== p.key))}
                  aria-label={t("common.remove")}
                  disabled={participants.length === 1}
                  className="col-start-3 row-start-2 grid place-items-center text-muted hover:text-danger disabled:opacity-30 sm:col-start-auto sm:row-start-auto"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 p-5 pt-3">
            <Button onClick={addParticipant} disabled={participants.length >= MAX_PARTICIPANTS} className="w-full border-dashed">
              <Plus size={16} />
              {t("setup.add")}
            </Button>
            <p className="text-xs text-muted">{t("setup.onlineHint", { count: online.size })}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
