/** 순수 KST 경계/라벨 계산. server-only 의존 없음 → 단위 테스트 가능. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `kstNow`: getUTC*()가 KST 벽시계 값으로 읽히는 Date (nowKstParts() 형태). */
export function monthBoundsFromKst(kstNow: Date): { startISO: string; endISO: string } {
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - KST_OFFSET_MS);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** 그 주의 월요일 00:00 KST ~ 일요일 00:00 KST (월~토 6일 커버), 실제 UTC instant. */
export function weekBoundsFromKst(kstNow: Date): { startISO: string; endISO: string } {
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const dow = kstNow.getUTCDay();        // 0=일..6=토 (KST)
  const daysSinceMon = (dow + 6) % 7;    // 월=0 .. 일=6
  const start = new Date(Date.UTC(y, m, d - daysSinceMon) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d - daysSinceMon + 6) - KST_OFFSET_MS);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function monthLabelFromKst(kstNow: Date): string {
  return `${kstNow.getUTCFullYear()}년 ${kstNow.getUTCMonth() + 1}월`;
}

/** KST 달력일(kstDay의 UTC 연/월/일)의 시:분 슬롯 → 실제 UTC instant. 반복 스케줄→세션 생성에 사용. */
export function kstSlotInstant(kstDay: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(kstDay.getUTCFullYear(), kstDay.getUTCMonth(), kstDay.getUTCDate(), hour, minute) - KST_OFFSET_MS);
}
