"use client";

// Welcome screen: a huge لُبّ with the tagline under it, in layers that drift at different depths with the mouse
// (parallax). Scrolling down, swiping up, Enter or the button lifts it away to the page underneath: as it goes,
// the tagline rises fastest, the word slower while it grows and fades, the glows slowest.
//
// Shown once per browser tab. The theme script in app/layout.jsx sets <html data-welcome> before the first paint
// when this tab hasn't seen it yet, and CSS hides it otherwise, so it never flashes in or out on a reload.
import { ChevronDown } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const SEEN = "lubb-welcomed";

export function WelcomeIntro() {
  const { t } = useTranslation();
  const still = useReducedMotion();
  const [open, setOpen] = useState(true);
  const leaving = useRef(false);

  // how far the visitor has scrolled into the page (0 = welcome, 1 = gone), eased so wheel steps glide
  const progress = useMotionValue(0);
  const p = useSpring(progress, { stiffness: 110, damping: 22, mass: 0.6 });
  // pointer position, -1…1 from the centre, eased
  const mx = useSpring(0, { stiffness: 50, damping: 18 });
  const my = useSpring(0, { stiffness: 50, damping: 18 });

  // Each layer: [scroll travel, mouse travel]. Nearer layers move more with the mouse.
  const layer = (rise, depth) => ({
    x: useTransform(mx, (v) => v * -depth),
    y: useTransform([p, my], ([pv, v]) => pv * -rise + v * -depth),
  });
  const grid = layer(40, 6);
  const glowA = layer(90, 34);
  const glowB = layer(140, 22);
  const word = layer(170, 16);
  const tagline = layer(420, 30);
  const wordScale = useTransform(p, [0, 1], [1, 1.14]);
  const wordOpacity = useTransform(p, [0, 0.75], [1, 0]);
  const tagOpacity = useTransform(p, [0, 0.45], [1, 0]);
  const hintOpacity = useTransform(p, [0, 0.2], [1, 0]);
  const sheet = useTransform(p, [0.5, 1], ["0%", "-100%"]); // the whole screen lifts away at the end

  const finish = () => {
    if (leaving.current) return;
    leaving.current = true;
    animate(progress, 1, { duration: still ? 0.2 : 0.7, ease: [0.65, 0, 0.35, 1] });
    setTimeout(
      () => {
        try {
          sessionStorage.setItem(SEEN, "1");
        } catch {}
        delete document.documentElement.dataset.welcome;
        setOpen(false);
      },
      still ? 250 : 1100,
    );
  };

  useEffect(() => {
    if (document.documentElement.dataset.welcome !== "1") return setOpen(false); // already seen in this tab

    const onWheel = (e) => {
      e.preventDefault(); // the page underneath doesn't scroll while this is up
      if (leaving.current) return;
      const next = Math.min(Math.max(progress.get() + e.deltaY / 900, 0), 1);
      progress.set(next);
      if (next > 0.35) finish(); // past a third of the way: carry on by itself
    };
    let touchY = null;
    const onTouchStart = (e) => (touchY = e.touches[0].clientY);
    const onTouchMove = (e) => {
      if (touchY === null || leaving.current) return;
      const next = Math.min(Math.max(progress.get() + (touchY - e.touches[0].clientY) / 500, 0), 1);
      touchY = e.touches[0].clientY;
      progress.set(next);
      if (next > 0.3) finish();
    };
    const onKey = (e) => ["Enter", " ", "ArrowDown", "PageDown", "Escape"].includes(e.key) && (e.preventDefault(), finish());
    const onPointer = (e) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    if (!still) window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <motion.div
      role="dialog"
      aria-label={t("welcome.label")}
      style={{ y: sheet }}
      className="welcome no-print fixed inset-0 z-[100] overflow-hidden bg-rail text-rail-fg"
    >
      {/* far: a fine dot grid */}
      <motion.div
        aria-hidden
        style={grid}
        className="absolute -inset-16 opacity-[0.14] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:28px_28px]"
      />
      {/* mid: the ring's two colours as soft glows */}
      <motion.div aria-hidden style={glowA} className="absolute start-[12%] top-[18%] size-[46vmax] rounded-full bg-[#8b5cf6] opacity-25 blur-[110px]" />
      <motion.div aria-hidden style={glowB} className="absolute end-[8%] bottom-[6%] size-[40vmax] rounded-full bg-[#22d3ee] opacity-20 blur-[110px]" />

      {/* near: the word and the tagline */}
      <div className="relative grid h-full place-items-center px-6">
        <div className="text-center">
          <motion.div style={{ ...word, scale: wordScale, opacity: wordOpacity }}>
            <motion.span
              lang="ar"
              dir="rtl"
              initial={{ opacity: 0, scale: 1.08, filter: "blur(14px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
              className="block font-brand text-[clamp(7rem,19vw,16rem)] leading-[1.6] font-black"
            >
              لُبّ
            </motion.span>
          </motion.div>
          <motion.div style={{ ...tagline, opacity: tagOpacity }}>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className="-mt-[0.4em] text-[clamp(1.25rem,2.6vw,2.25rem)] font-medium text-rail-fg/75"
            >
              {t("brand.tagline")}
            </motion.p>
          </motion.div>
        </div>
      </div>

      {/* how to get in */}
      <motion.div
        style={{ opacity: hintOpacity }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-3"
      >
        <button
          onClick={finish}
          className="rounded-full border border-rail-fg/30 px-6 py-2 text-sm font-medium transition-colors hover:bg-rail-fg hover:text-rail"
        >
          {t("welcome.enter")}
        </button>
        <span className="flex flex-col items-center text-xs text-rail-fg/50">
          {t("welcome.hint")}
          <motion.span animate={still ? undefined : { y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
            <ChevronDown size={18} />
          </motion.span>
        </span>
      </motion.div>
    </motion.div>
  );
}
