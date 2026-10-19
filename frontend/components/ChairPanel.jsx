"use client";

// Chairman mode: buttons ask to speak (queue), the chair gives or takes back the floor here.
import { Gavel, Hand, Mic, MicOff, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorText } from "@/lib/api";
import { useHub } from "@/lib/useHub";
import { Stagger, StaggerItem, enter } from "./motion";
import { Avatar, Button, Card, CardHeader, VoiceBars } from "./ui";

export function ChairPanel({ meeting }) {
  const { t } = useTranslation();
  const [floor, setFloor] = useState({ talking: [], queue: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const byDevice = Object.fromEntries(meeting.participants.filter((p) => p.device_id).map((p) => [p.device_id, p]));

  const load = useCallback(async () => {
    try {
      setFloor(await api(`/meetings/${meeting.id}/floor`));
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [meeting.id, t]);

  const connected = useHub((e) => {
    if (e.type === "floor" && e.meeting_id === meeting.id) setFloor({ talking: e.talking, queue: e.queue });
  });
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const act = async (path, body) => {
    setBusy(true);
    setError(null);
    try {
      setFloor(await api(`/meetings/${meeting.id}/floor/${path}`, { method: "POST", body }));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const speaker = floor.talking.map((d) => byDevice[d]).find(Boolean);

  return (
    <Card>
      <CardHeader icon={Gavel} title={t("chair.title")} action={<span className="text-xs text-muted">{t("chair.subtitle")}</span>} />
      <div className="space-y-4 p-4 text-sm">
        {/* Who has the floor */}
        <AnimatePresence mode="wait" initial={false}>
        {speaker ? (
          <motion.div key={speaker.id} {...enter} exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }} className="flex items-center gap-3 rounded-lg bg-subtle p-3">
            <Avatar name={speaker.name} color={speaker.color} photo={speaker.photo} size="sm" ring />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{speaker.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <VoiceBars color="currentColor" />
                {t("chair.hasFloor")}
              </div>
            </div>
            <Button variant="danger" onClick={() => act("revoke")} disabled={busy} className="px-3 py-1.5 text-xs">
              <MicOff size={14} />
              {t("chair.revoke")}
            </Button>
          </motion.div>
        ) : (
          <motion.p key="nobody" {...enter} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="flex items-center gap-2 rounded-lg bg-subtle p-3 text-muted">
            <Mic size={15} />
            {t("chair.nobody")}
          </motion.p>
        )}
        </AnimatePresence>

        {/* Raised hands, in order */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <Hand size={14} />
            {t("chair.requests", { count: floor.queue.length })}
          </div>
          {floor.queue.length === 0 ? (
            <p className="text-xs text-muted">{t("chair.noRequests")}</p>
          ) : (
            <Stagger as="ol" className="space-y-1.5">
              <AnimatePresence>
              {floor.queue.map((d, i) => {
                const p = byDevice[d];
                return (
                  <StaggerItem as="li" key={d} className="flex items-center gap-2.5 rounded-lg border border-line p-2">
                    <span className="w-4 text-center font-mono text-xs text-muted">{i + 1}</span>
                    <Avatar name={p?.name ?? "?"} color={p?.color ?? "#71717a"} photo={p?.photo} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{p?.name ?? d}</span>
                    <Button variant="primary" onClick={() => act("grant", { device_id: d })} disabled={busy} className="px-3 py-1.5 text-xs">
                      {t("chair.grant")}
                    </Button>
                    <button
                      onClick={() => act("dismiss", { device_id: d })}
                      disabled={busy}
                      aria-label={t("chair.dismiss")}
                      title={t("chair.dismiss")}
                      className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  </StaggerItem>
                );
              })}
              </AnimatePresence>
            </Stagger>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Card>
  );
}
