"use client";

// "Speaking now": whoever holds the floor pops up in the corner with their photo, a pulsing ring, their voice
// and how long they've been talking. It leaves when they stop. Several at once (free mode) stack up.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mmss } from "@/lib/format";
import { spring } from "./motion";
import { VoiceBars } from "./ui";

const MAX_SHOWN = 3;

export function SpeakerSpotlight({ speakers }) {
  return (
    <div className="no-print pointer-events-none fixed bottom-20 end-4 z-30 flex flex-col items-end gap-3 md:bottom-8 md:end-8">
      <AnimatePresence>
        {speakers.slice(0, MAX_SHOWN).map((p) => (
          <Spot key={p.id} person={p} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** A speaker's face, large: their photo, or their initial on their colour. */
export function SpeakerPhoto({ person, className = "" }) {
  return person.photo ? (
    <img src={person.photo} alt={person.name} className={`rounded-full object-cover ${className}`} draggable={false} />
  ) : (
    <span
      className={`grid place-items-center rounded-full font-semibold text-white ${className}`}
      style={{ backgroundColor: person.color }}
      aria-label={person.name}
    >
      {person.name.slice(0, 1)}
    </span>
  );
}

function Spot({ person: p }) {
  const { t } = useTranslation();
  const [since] = useState(() => Date.now()); // mounted = started talking
  const [now, setNow] = useState(since);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.92, transition: { duration: 0.2 } }}
      transition={spring}
      className="pointer-events-auto flex items-center gap-4 rounded-2xl bg-fg py-3 ps-3 pe-6 text-bg shadow-2xl"
      role="status"
    >
      <div className="relative size-20 shrink-0">
        {/* the ring breathes outward while they speak */}
        <motion.span
          aria-hidden
          className="absolute -inset-1.5 rounded-full border-2 border-signal"
          animate={{ scale: [1, 1.14, 1], opacity: [0.9, 0, 0.9] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.05 }} className="size-full">
          <SpeakerPhoto person={p} className="size-full text-3xl ring-2 ring-signal" />
        </motion.div>
      </div>
      <div className="min-w-0">
        <p className="label text-signal">{t("speaker.talking")}</p>
        <p className="max-w-56 truncate text-xl font-semibold leading-tight">
          <bdi>{p.name}</bdi>
        </p>
        {p.title && (
          <p className="max-w-56 truncate text-sm text-bg/60">
            <bdi>{p.title}</bdi>
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <VoiceBars color="var(--signal)" />
          <span className="font-mono text-xs tabular-nums text-bg/60" dir="ltr">
            {mmss(Math.floor((now - since) / 1000))}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
