import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/** Shared server-side data helpers for the Supabase-backed repository. */
export { getTrainerContext, getMemberContext } from "@/lib/auth/context";

/** Service-role client (server only). Scoping is enforced in code via the auth context. */
export const sb = createSupabaseAdmin();

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Current instant shifted to KST wall-clock (use .getUTC*() to read KST parts). */
export function nowKstParts() {
  const d = new Date(Date.now() + KST_OFFSET_MS);
  return d;
}

/** "YYYY-MM-DD" in KST for a timestamptz ISO string (or Date). */
export function kstDateISO(iso: string | Date): string {
  const d = new Date(typeof iso === "string" ? iso : iso.getTime());
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour (0-23) in KST. */
export function kstHour(iso: string | Date): number {
  const d = new Date(typeof iso === "string" ? iso : iso.getTime());
  return new Date(d.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** Weekday 0=Sun..6=Sat in KST. */
export function kstWeekday(iso: string | Date): number {
  const d = new Date(typeof iso === "string" ? iso : iso.getTime());
  return new Date(d.getTime() + KST_OFFSET_MS).getUTCDay();
}

export function hourLabel(h: number): string {
  if (h < 12) return `오전 ${h === 0 ? 12 : h}:00`;
  if (h === 12) return "오후 12:00";
  return `오후 ${h - 12}:00`;
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
export function weekdayKo(wd: number): string {
  return WD[wd];
}

/** Today's date ISO (KST). */
export function todayISO(): string {
  return kstDateISO(new Date());
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function dayDiff(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}
