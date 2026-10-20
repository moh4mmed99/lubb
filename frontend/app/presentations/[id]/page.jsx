"use client";

// Presenting a deck: slides are a stack of cards. Next drops the top card away; previous drops it back on.
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { spring } from "@/components/motion";
import { Button, Loading, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/api";

const BEHIND = 2; // cards visible under the current slide

// `custom` = direction of travel (+1 next, -1 previous), so each card knows how to arrive / leave.
const card = {
  initial: (dir) => (dir < 0 ? { y: -640, rotate: -7, opacity: 0 } : { y: 60, scale: 0.86, opacity: 0 }),
  exit: (dir) =>
    dir > 0
      ? { y: 760, rotate: 9, opacity: 0, zIndex: 30, transition: { duration: 0.5, ease: [0.45, 0, 0.7, 1] } } // falls off the table
      : { y: 60, scale: 0.86, opacity: 0, transition: { duration: 0.2 } },
};

export default function PresenterPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const rtl = i18n.language === "ar";
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const [[n, dir], setPage] = useState([1, 0]);
  const [full, setFull] = useState(false);
  const [rec, setRec] = useState(null); // { recording, meeting_title } from the hub
  const stage = useRef(null);

  useEffect(() => {
    api(`/presentations/${id}`)
      .then(setDeck)
      .catch((err) => setError(errorText(err, t)));
  }, [id, t]);

  // Tell the hub what's on screen. A live meeting keeps recording and tags what's said with this slide.
  useEffect(() => {
    if (!deck) return;
    api(`/presentations/${deck.id}/show`, { method: "POST", body: { slide: n } })
      .then(setRec)
      .catch(() => setRec(null));
  }, [deck, n]);
  // Leaving the presenter: the screen goes back to the meeting (keepalive survives the page closing)
  useEffect(() => () => void fetch("/api/presentations/stop", { method: "POST", keepalive: true }).catch(() => {}), []);

  const go = useCallback(
    (delta) =>
      setPage(([cur]) => {
        const next = Math.min(Math.max(cur + delta, 1), deck?.slides ?? 1);
        return next === cur ? [cur, 0] : [next, delta];
      }),
    [deck],
  );

  // Keyboard: arrows follow reading direction; space / page keys work like a clicker
  useEffect(() => {
    const onKey = (e) => {
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if ([forward, " ", "PageDown", "ArrowDown"].includes(e.key)) go(1);
      else if ([back, "PageUp", "ArrowUp"].includes(e.key)) go(-1);
      else if (e.key === "Home") setPage([1, -1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, rtl]);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : stage.current?.requestFullscreen?.());

  if (error) return <div className="page"><Notice tone="danger">{error}</Notice></div>;
  if (!deck) return <Loading />;

  const visible = Array.from({ length: BEHIND + 1 }, (_, i) => n + i).filter((s) => s <= deck.slides);
  const [Prev, Next] = rtl ? [ChevronRight, ChevronLeft] : [ChevronLeft, ChevronRight];
  const Back = rtl ? ArrowRight : ArrowLeft;

  // Off-centre stack: cards behind peek out down *and* toward the end side (into the rail's gutter).
  // Full screen drops the asymmetry: the room sees the slide straight on.
  const toEnd = full ? 0 : rtl ? -1 : 1;
  const stack = (
    <div className="relative pb-10">
      <div className="relative aspect-video">
        <AnimatePresence custom={dir} initial={false}>
          {visible.map((s) => {
            const pos = s - n; // 0 = on top
            return (
              <motion.button
                key={s}
                type="button"
                custom={dir}
                variants={card}
                initial="initial"
                exit="exit"
                animate={{ y: pos * 18, x: pos * 22 * toEnd, scale: 1 - pos * 0.05, rotate: 0, opacity: 1 - pos * 0.25, zIndex: 10 - pos }}
                transition={spring}
                onClick={() => pos === 0 && go(1)}
                aria-label={t("decks.slideOf", { n: s, total: deck.slides })}
                className="absolute inset-0 origin-bottom overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
                style={{ cursor: pos === 0 && n < deck.slides ? "pointer" : "default" }}
              >
                <img src={`/api/presentations/${deck.id}/slides/${s}.png`} alt="" className="size-full object-contain" draggable={false} />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
  const prevBtn = (
    <Button onClick={() => go(-1)} disabled={n === 1} aria-label={t("decks.prev")} className="px-3">
      <Prev size={18} />
    </Button>
  );
  const nextBtn = (
    <Button variant="primary" onClick={() => go(1)} disabled={n === deck.slides} aria-label={t("decks.next")} className="flex-1 px-3">
      <Next size={18} />
    </Button>
  );

  return (
    // overflow-clip: a card falling off the bottom (or tilting past the sides) must not make the page scroll
    <div ref={stage} className={`min-h-full overflow-clip page ${full ? "flex flex-col items-center justify-center gap-8 bg-black text-white" : ""}`}>
      {full ? (
        <>
          <div className="w-full max-w-[min(92vw,calc(82vh*16/9))]">{stack}</div>
          <div className="flex items-center gap-4">
            {prevBtn}
            <span className="min-w-20 text-center font-mono text-sm tabular-nums" dir="ltr">
              {n} / {deck.slides}
            </span>
            {nextBtn}
            <Button onClick={toggleFull} aria-label={t("decks.exitPresent")} className="border-white/40 px-3 text-white">
              <Minimize2 size={16} />
            </Button>
          </div>
        </>
      ) : (
        // Slide owns the wide column on the start side; a narrow rail on the end side carries everything else
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
          {stack}
          <aside className="space-y-8 lg:sticky lg:top-8">
            <div>
              <Link href="/presentations" className="label inline-flex items-center gap-1.5 text-muted hover:text-fg">
                <Back size={14} />
                {t("decks.title")}
              </Link>
              <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
                <bdi>{deck.title}</bdi>
              </h1>
              <span aria-hidden className="mt-4 block h-1.5 w-12 bg-fg" />
            </div>

            {/* Oversized current number, small total: the one figure that matters while presenting */}
            <div className="flex items-end gap-4">
              <div className="h-24 w-1 overflow-hidden rounded-full bg-line">
                <motion.div className="w-full rounded-full bg-accent" animate={{ height: `${(n / deck.slides) * 100}%` }} transition={spring} />
              </div>
              <p className="leading-none" dir="ltr">
                <motion.span key={n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="inline-block text-6xl font-semibold tabular-nums">
                  {String(n).padStart(2, "0")}
                </motion.span>
                <span className="ms-1 font-mono text-sm text-muted">/ {String(deck.slides).padStart(2, "0")}</span>
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                {prevBtn}
                {nextBtn}
              </div>
              <Button onClick={toggleFull} className="w-full">
                <Maximize2 size={15} />
                {t("decks.present")}
              </Button>
            </div>
            {rec && (
              <p className={`flex items-start gap-2 text-xs leading-relaxed ${rec.recording ? "text-fg" : "text-muted"}`}>
                <span className={`mt-1 size-2 shrink-0 rounded-full ${rec.recording ? "animate-pulse bg-danger" : "bg-line"}`} />
                <span>
                  {rec.recording ? (
                    <>
                      {t("decks.recording")} <bdi className="font-medium">{rec.meeting_title}</bdi>
                    </>
                  ) : (
                    t("decks.notRecording")
                  )}
                </span>
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted">{t("decks.keysHint")}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
