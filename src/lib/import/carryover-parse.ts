// 일괄 등록('한꺼번에 입력') 공용 타입·날짜 검증 (순수 — 서버·클라 공용).

export type CarrySlot = { weekday: number; hour: number; minute: number };

/** 다양한 날짜 표기 → YYYY-MM-DD. 유효하지 않으면 null. */
export function parseEndDate(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  let y: string, m: string, day: string;
  if (d.length === 8) {
    y = d.slice(0, 4);
    m = d.slice(4, 6);
    day = d.slice(6, 8);
  } else if (d.length === 6) {
    y = `20${d.slice(0, 2)}`;
    m = d.slice(2, 4);
    day = d.slice(4, 6);
  } else return null;
  const mm = Number(m);
  const dd = Number(day);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // 라운드트립 검증: 2/30, 4/31, 평년 2/29 등 존재하지 않는 날짜 거부.
  const dt = new Date(Number(y), mm - 1, dd);
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${y}-${m}-${day}`;
}
