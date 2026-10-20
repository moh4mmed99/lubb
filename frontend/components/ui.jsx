"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { fadeIn, rise, spring } from "./motion";

// Small shared building blocks. Minimal: frosted-glass cards, hairlines, black for primary actions,
// the green signal colour only for what is live or selected.

export function Card({ className = "", interactive = false, children }) {
  const classes = `glass overflow-hidden rounded-xl border ${className}`;
  // The card rises into place with the page (`rise`, via the page's variants). It never fades: see pageEnter.
  if (!interactive)
    return (
      <motion.section className={classes} variants={rise}>
        {children}
      </motion.section>
    );
  // Clickable / glanceable cards lift on a spring
  return (
    <motion.section
      className={classes}
      variants={rise}
      whileHover={{ y: -3, boxShadow: "0 12px 28px -12px rgb(0 0 0 / 0.18)" }}
      whileTap={{ y: -1, scale: 0.995 }}
      transition={spring}
    >
      {children}
    </motion.section>
  );
}

export function CardHeader({ title, action, icon: Icon }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <h2 className="label flex items-center gap-2">
        {Icon && <Icon size={15} strokeWidth={2} className="text-muted" />}
        {title}
      </h2>
      {action}
    </div>
  );
}

const variants = {
  primary: "bg-fg text-bg hover:bg-signal hover:text-black",
  ghost: "border border-fg/80 hover:bg-fg hover:text-bg",
  danger: "border border-danger text-danger hover:bg-danger hover:text-white",
};

export function Button({ variant = "ghost", className = "", ...props }) {
  return (
    <motion.button
      whileTap={props.disabled ? undefined : { scale: 0.96 }}
      transition={spring}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

const tones = { muted: "text-muted", ok: "text-ok", danger: "text-danger", accent: "text-accent", warn: "text-warn" };

export function Badge({ tone = "muted", pulse = false, children }) {
  return (
    <span className={`label inline-flex items-center gap-1.5 rounded-full border border-current/40 px-2.5 py-0.5 ${tones[tone]}`}>
      <span className={`size-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`} />
      {children}
    </span>
  );
}

export function Avatar({ name, color, photo, size = "md", ring = false, dim = false }) {
  const dims = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold transition ${dims} ${dim ? "opacity-40" : ""}`}
      style={{
        backgroundColor: `${color}1f`,
        color,
        boxShadow: ring ? `0 0 0 2px var(--card), 0 0 0 4px var(--signal)` : undefined,
      }}
    >
      {photo ? <img src={photo} alt={name} className="size-full object-cover" /> : name.slice(0, 1)}
    </span>
  );
}

/** Animated "voice" bars shown next to whoever is talking. */
export function VoiceBars({ color }) {
  return (
    <span className="inline-flex h-3.5 items-center gap-0.5" aria-hidden>
      {[0, 0.2, 0.4, 0.1].map((delay, i) => (
        <span
          key={i}
          className="h-full w-0.5 origin-center rounded-full"
          style={{ backgroundColor: color, animation: `bar 0.9s ${delay}s ease-in-out infinite` }}
        />
      ))}
    </span>
  );
}

export function Segmented({ value, options, onChange }) {
  const id = useId(); // each control gets its own sliding highlight
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <motion.button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            whileTap={{ scale: 0.95 }}
            transition={spring}
            className={`relative rounded-md px-3 py-1.5 text-sm transition-colors duration-200 ${active ? "font-medium text-bg" : "text-muted hover:text-fg"}`}
          >
            {active && <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-md bg-fg" />}
            <span className="relative">{o.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-card/50 px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-fg";

export function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="label text-muted">{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <motion.div variants={fadeIn} className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div className="min-w-0">
        {subtitle && <p className="label mb-2 text-muted">{subtitle}</p>}
        {/* -0.03em: the glyphs' built-in side space, trimmed so the letters (not their box) line up with the rule and cards */}
        <h1 className="ms-[-0.03em] text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
        {/* Signature mark: a short heavy rule anchored to the start edge, not a full-width line */}
        <span aria-hidden className="mt-5 block h-1.5 w-16 bg-fg" />
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/** A one-line message strip: errors, warnings, "the hub is offline". */
export function Notice({ tone = "muted", children, action }) {
  const border = { muted: "border-line", danger: "border-danger", warn: "border-warn", ok: "border-ok" }[tone];
  return (
    <motion.div
      initial={{ y: -6 }} // glass: slides in, never fades (see pageEnter in motion.jsx)
      animate={{ y: 0 }}
      transition={spring}
      className={`no-print flex flex-wrap items-center justify-between gap-3 glass rounded-lg border border-s-4 px-4 py-3 text-sm ${border}`}
    >
      <span className={tones[tone] ?? ""}>{children}</span>
      {action}
    </motion.div>
  );
}

export function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-xl bg-fg text-bg">
          <Icon size={22} strokeWidth={1.5} />
        </span>
      )}
      <h2 className="text-xl font-semibold">{title}</h2>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid place-items-center py-24">
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-fg" />
    </div>
  );
}
