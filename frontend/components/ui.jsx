// Small shared building blocks. Keep the look quiet: neutral surfaces, thin lines, one accent.

export function Card({ className = "", children }) {
  return <section className={`rounded-xl border border-line bg-card ${className}`}>{children}</section>;
}

export function CardHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

const variants = {
  primary: "bg-fg text-bg hover:opacity-90",
  ghost: "border border-line hover:bg-subtle",
  danger: "border border-line text-danger hover:bg-subtle",
};

export function Button({ variant = "ghost", className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

const tones = { muted: "text-muted", ok: "text-ok", danger: "text-danger", accent: "text-accent", warn: "text-warn" };

export function Badge({ tone = "muted", pulse = false, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs ${tones[tone]}`}>
      <span className={`size-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`} />
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = "md", ring = false, dim = false }) {
  const dims = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold transition ${dims} ${dim ? "opacity-40" : ""}`}
      style={{
        backgroundColor: `${color}1f`,
        color,
        boxShadow: ring ? `0 0 0 2px var(--card), 0 0 0 4px ${color}` : undefined,
      }}
    >
      {name.slice(0, 1)}
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
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-subtle p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            value === o.value ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent";

export function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A one-line message strip: errors, warnings, "the hub is offline". */
export function Notice({ tone = "muted", children, action }) {
  const border = { muted: "border-line", danger: "border-danger/40", warn: "border-warn/40", ok: "border-ok/40" }[tone];
  return (
    <div className={`no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm ${border}`}>
      <span className={tones[tone] ?? ""}>{children}</span>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-full bg-subtle text-muted">
          <Icon size={22} strokeWidth={1.5} />
        </span>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
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
