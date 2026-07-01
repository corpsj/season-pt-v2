// 기존 회원권 이관 CSV 파서 (순수 — 서버·클라 공용, 미리보기/검증에 사용).
// 열 순서: 이름, 연락처, 생년월일, 성별, 상품명, 잔여횟수, 만료일, 정기일정, [담당강사]
// 예) 김서연,010-1234-5678,920101,여,1:1 PT 20회권,7,2026-08-31,월 19:00 / 수 19:00,박지훈

export type CarrySlot = { weekday: number; hour: number; minute: number };
export type Gender = "male" | "female";

export type CarryRow = {
  name: string;
  phone: string;
  birth: string; // YYMMDD (원본 6자리)
  gender: Gender;
  productName: string;
  remaining: number;
  endDate: string; // YYYY-MM-DD
  slots: CarrySlot[];
  trainerName: string | null;
  valid: boolean;
  reason?: string;
};

const WEEKDAY: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

/** "월 19:00 / 수 20:30" → [{weekday:1,hour:19,minute:0},{weekday:3,hour:20,minute:30}]. 분은 0/30만(스케줄 제약). */
export function parseSlots(raw: string): CarrySlot[] {
  const out: CarrySlot[] = [];
  for (const piece of raw.split(/[,/·]/).map((s) => s.trim()).filter(Boolean)) {
    const wd = piece.match(/[일월화수목금토]/);
    const hm = piece.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!wd || !hm) continue;
    const hour = Number(hm[1]);
    if (hour < 0 || hour > 23) continue;
    const minute = Number(hm[2] ?? 0) >= 30 ? 30 : 0;
    out.push({ weekday: WEEKDAY[wd[0]], hour, minute });
  }
  return out;
}

/** 다양한 만료일 표기 → YYYY-MM-DD. 유효하지 않으면 null. */
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

/** 헤더(첫 행에 '이름'/'상품' 등) 자동 감지 후 각 행 파싱·검증. */
export function parseCarryoverCsv(text: string): CarryRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // 헤더 판정은 첫 '칸'만 검사(상품명 등 데이터가 '상품'을 포함해도 데이터 행을 삼키지 않게).
  const firstCell = lines[0].split(",")[0]?.trim() ?? "";
  const body = /이름|name/i.test(firstCell) ? lines.slice(1) : lines;

  return body.map((line) => {
    const [name = "", phone = "", birth = "", genderRaw = "", productName = "", remainingRaw = "", endRaw = "", slotsRaw = "", trainerRaw = ""] =
      line.split(",").map((c) => c.trim());

    const gender: Gender = /남|^m/i.test(genderRaw) ? "male" : "female";
    const remainingDigits = remainingRaw.replace(/[^\d]/g, "");
    const remaining = Number(remainingDigits);
    const endDate = parseEndDate(endRaw);
    const slots = parseSlots(slotsRaw);
    const trainerName = trainerRaw || null;

    let reason: string | undefined;
    if (!name) reason = "이름 없음";
    else if (phone.replace(/\D/g, "").length < 9) reason = "연락처 오류";
    else if (birth.replace(/\D/g, "").length !== 6) reason = "생년월일 6자리 아님";
    else if (!productName) reason = "상품명 없음";
    else if (!remainingDigits) reason = "잔여횟수 오류";
    else if (!endDate) reason = "만료일 오류";

    return { name, phone, birth, gender, productName, remaining, endDate: endDate ?? "", slots, trainerName, valid: !reason, reason };
  });
}
