import type { Meeting } from "../types";

const seconds = (from: string, to: string) =>
  Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000));

/** Elapsed time between two timestamps, as HH:MM:SS. */
export function elapsed(from: string, to: string): string {
  const s = seconds(from, to);
  return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

/** Human duration like "1h 15m" (English) or "1 ساعة 15 دقيقة" (Arabic). */
export function duration(from: string, to: string, lng: string): string {
  const m = Math.round(seconds(from, to) / 60);
  const h = Math.floor(m / 60);
  const [hu, mu] = lng === "ar" ? [" ساعة", " دقيقة"] : ["h", "m"];
  return h ? `${h}${hu} ${m % 60}${mu}` : `${m}${mu}`;
}

/** Seconds as M:SS. */
export function mmss(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Date/time in the UI language, always with Western digits (as in the prototype). */
export function formatDate(iso: string, lng: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(`${lng}-u-nu-latn`, opts).format(new Date(iso));
}

/** Seconds each participant held the floor. */
export function speakingTime(meeting: Meeting): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of meeting.utterances) out[u.participant_id] = (out[u.participant_id] ?? 0) + seconds(u.started_at, u.ended_at);
  return out;
}

export const SPEAKER_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#f59e0b", "#06b6d4", "#ef4444",
  "#84cc16", "#6366f1", "#14b8a6", "#f97316", "#d946ef", "#0ea5e9", "#eab308",
  "#10b981", "#8b5cf6", "#f43f5e", "#64748b", "#a3e635", "#fb7185",
]; // one per seat, up to 20
