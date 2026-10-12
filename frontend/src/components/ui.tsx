// Small shared building blocks. Keep the look quiet: neutral surfaces, thin lines, one accent.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-xl border border-line bg-card ${className}`}>{children}</section>;
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

type Variant = "primary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90",
  ghost: "border border-line hover:bg-subtle",
  danger: "border border-line text-danger hover:bg-subtle",
};

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Badge({ tone = "muted", children }: { tone?: "muted" | "ok" | "danger" | "accent"; children: ReactNode }) {
  const color = { muted: "text-muted", ok: "text-ok", danger: "text-danger", accent: "text-accent" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs ${color}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = "md", ring = false }: { name: string; color: string; size?: "sm" | "md"; ring?: boolean }) {
  const dims = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${dims}`}
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
export function VoiceBars({ color }: { color: string }) {
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

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-subtle p-1">
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
