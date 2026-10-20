"use client";

// A voice ring behind the page content: dozens of hairline loops around one centre, each a little out of phase
// with the next, so together they braid into ribbons that twist, swell and turn like an assistant listening.
//
// It's as large as the content area allows while staying whole, centred in it. Colour is a two-tone sweep
// (violet into cyan) that travels slowly round the ring, over a soft glow. Drawn on a canvas each
// frame; it keeps to one still frame for people who prefer reduced motion.
//
// It answers the mouse: point near the ring and the ribbons nearby swell softly toward the pointer, like a hand
// moving through water, and settle back when it leaves. The canvas itself ignores the mouse (clicks go to
// the page); it only watches where the pointer is.
import { useEffect, useRef } from "react";

// background-only colours, round the ring; the first repeats at the end so the sweep has no seam
const HUES = ["#8b5cf6", "#22d3ee", "#8b5cf6"];
const REACH = 1.34; // the furthest a lobe pushes out, as a multiple of the base radius
const LOOPS = 44;
const STEPS = 240; // points per loop: enough that a bulge stays a smooth curve

export function WaveBackdrop() {
  const canvas = useRef(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let last = 0; // previous frame time, so easing is the same at any frame rate
    // the pointer, eased: where it is (canvas px) and how strongly the ring is answering it (0…1)
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, power: 0, inside: false };
    const onMove = (e) => {
      const box = el.getBoundingClientRect();
      ptr.tx = e.clientX - box.left;
      ptr.ty = e.clientY - box.top;
      ptr.inside = ptr.tx >= 0 && ptr.ty >= 0 && ptr.tx <= box.width && ptr.ty <= box.height;
      if (ptr.power < 0.02) [ptr.x, ptr.y] = [ptr.tx, ptr.ty]; // waking up: start where the pointer is
    };
    const onLeave = () => (ptr.inside = false);
    if (!still) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // hairlines need no more; keeps redraws cheap
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (ms) => {
      const t = ms / 1000;
      const dt = Math.min((ms - last) / 1000, 0.1);
      last = ms;
      const ease = (tau) => 1 - Math.exp(-dt / tau); // fraction of the way to close this frame
      // as big as fits with a margin, lobes included, so the ring is never cut off
      const R = (Math.min(w, h) * 0.46) / REACH;
      const cx = w / 2 + Math.sin(t * 0.07) * R * 0.03;
      const cy = h / 2 + Math.cos(t * 0.09) * R * 0.03;

      ctx.clearRect(0, 0, w, h);

      // soft glows that orbit inside the ring: violet and cyan
      const glow = (k, c) => {
        const a = t * 0.12 + k * 2.1;
        const x = cx + Math.cos(a) * R * 0.45;
        const y = cy + Math.sin(a) * R * 0.45;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.1);
        g.addColorStop(0, c);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.11;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      [HUES[0], HUES[1]].forEach((c, k) => glow(k * 1.5, c));

      // the colour sweep turns a little faster than the ring, so colours flow along the ribbons
      const colour = ctx.createConicGradient(t * 0.18, cx, cy);
      HUES.forEach((c, k) => colour.addColorStop(k / (HUES.length - 1), c));
      ctx.strokeStyle = colour;
      ctx.lineWidth = 0.9;

      const turn = t * 0.05; // the whole ring turns, very slowly

      // follow the pointer with a short glide; swell in over about half a second, settle over one and a half
      ptr.x += (ptr.tx - ptr.x) * ease(0.45);
      ptr.y += (ptr.ty - ptr.y) * ease(0.45);
      ptr.power += ((ptr.inside ? 1 : 0) - ptr.power) * ease(ptr.inside ? 0.6 : 1.4);
      const pa = Math.atan2(ptr.y - cy, ptr.x - cx) - turn; // pointer's angle, in the ring's own turn
      const pd = Math.hypot(ptr.x - cx, ptr.y - cy);
      // strongest with the pointer on the ribbons, fading as it moves well inside or outside the ring
      const near = ptr.power * Math.exp(-(((pd - R) / (R * 0.8)) ** 2));
      const toward = Math.tanh((pd - R) / (R * 0.4)); // bulge out if it's outside, in if inside, no jump between
      for (let i = 0; i < LOOPS; i++) {
        const s = i / (LOOPS - 1); // 0 … 1 across the braid
        ctx.beginPath();
        for (let j = 0; j <= STEPS; j++) {
          const a = (j / STEPS) * Math.PI * 2;
          const da = Math.atan2(Math.sin(a - pa), Math.cos(a - pa)); // angle from the pointer, -π…π
          const touch = near * Math.exp(-((da / 0.95) ** 2)); // a wide stretch of ring by the pointer, fading softly
          const r =
            R *
            (1 +
              0.16 * Math.sin(3 * a + t * 0.35 + s * 4.6) + // three big lobes, sliding round across the braid
              0.1 * Math.sin(4 * a - t * 0.28 + s * 6.2 + 1.3) + // a second set the other way: the ribbons cross
              0.06 * Math.sin(2 * a + t * 0.21 - s * 3.1) + // slow breathing
              touch * (0.13 * toward + (s - 0.5) * 0.17) + // lean toward the pointer, the braid opening a little
              touch * 0.025 * Math.sin(a * 8 - t * 1.9 + s * 2)); // and a slow, broad ripple
          const x = cx + Math.cos(a + turn) * r;
          const y = cy + Math.sin(a + turn) * r;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        // two bright bands in the braid, so it reads as separate ribbons
        ctx.globalAlpha = 0.14 + 0.4 * Math.sin(s * Math.PI * 2) ** 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(0);
    });
    ro.observe(el);
    resize();
    still ? draw(0) : (raf = requestAnimationFrame(draw));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 z-0 md:start-60">
      <canvas ref={canvas} className="size-full" />
    </div>
  );
}
