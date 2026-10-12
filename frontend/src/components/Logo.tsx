// LUBB AI — "lubb" (لُبّ) means core: a ring (the hub / light ring) around its core.

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="16" cy="16" r="4.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-3" dir="ltr">
      <LogoMark />
      <span className="text-lg font-bold tracking-wide">
        LUBB <span className="font-medium text-muted">AI</span>
      </span>
    </span>
  );
}
