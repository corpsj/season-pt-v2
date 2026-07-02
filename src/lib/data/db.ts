import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { monthBoundsFromKst, weekBoundsFromKst, monthLabelFromKst } from "./kst-bounds";

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

/** Minute-aware time label from hour+minute ints (e.g. "오후 9:30"). */
export function hmLabel(h: number, m: number): string {
  const mm = String(m).padStart(2, "0");
  if (h < 12) return `오전 ${h === 0 ? 12 : h}:${mm}`;
  if (h === 12) return `오후 12:${mm}`;
  return `오후 ${h - 12}:${mm}`;
}

/** Minute-aware KST clock from a timestamptz (e.g. "오후 9:30") — use for session times. */
export function clockHM(iso: string | Date): string {
  const k = new Date((typeof iso === "string" ? new Date(iso) : iso).getTime() + KST_OFFSET_MS);
  const h = k.getUTCHours();
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  if (h < 12) return `오전 ${h === 0 ? 12 : h}:${mm}`;
  if (h === 12) return `오후 12:${mm}`;
  return `오후 ${h - 12}:${mm}`;
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
export function weekdayKo(wd: number): string {
  return WD[wd];
}

/** Today's date ISO (KST). */
export function todayISO(): string {
  return kstDateISO(new Date());
}

/**
 * "YYMMDD" → "YYYY-MM-DD" (YY>30 → 19YY, 아니면 20YY). 실존 날짜까지 검증 —
 * 990230 같은 입력이 DB 에러로 떨어져 '연락처 중복'으로 오인되던 문제 방지(감사 #29).
 */
export function parseBirth6(yymmdd: string): string | null {
  const d = yymmdd.replace(/\D/g, "");
  if (d.length !== 6) return null;
  const yy = Number(d.slice(0, 2));
  const year = yy > 30 ? 1900 + yy : 2000 + yy;
  const mo = Number(d.slice(2, 4));
  const da = Number(d.slice(4, 6));
  const dt = new Date(Date.UTC(year, mo - 1, da));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return null;
  return `${year}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function dayDiff(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/** 현재 KST 월 경계 [1일 00:00, 다음달 1일 00:00) — 실제 UTC instant. */
export function monthBoundsKst(): { startISO: string; endISO: string } {
  return monthBoundsFromKst(nowKstParts());
}

/** 현재 KST 주 경계 (월~토 커버) — 실제 UTC instant. */
export function weekBoundsKst(): { startISO: string; endISO: string } {
  return weekBoundsFromKst(nowKstParts());
}

/** "YYYY년 M월" (현재 KST 월). */
export function currentMonthLabel(): string {
  return monthLabelFromKst(nowKstParts());
}
