// 2:1 팀 스케줄 입력의 순수 검증/정규화. DB를 건드리지 않아 단위 테스트 가능(team-slots.test.ts).
// buildTeamSchedule(server-only)가 재사용한다.

export type Slot = { weekday: number; hour: number; minute: number };

/** 팀 구성원 2명이 서로 다른 유효한 id인지. 아니면 에러 문구. */
export function teamMembersError(memberIds: string[]): string | null {
  const ids = memberIds.filter((x) => typeof x === "string" && x.length > 0);
  if (ids.length !== 2) return "2:1 팀은 회원 두 명을 선택해야 해요.";
  if (ids[0] === ids[1]) return "서로 다른 두 회원을 선택해주세요.";
  return null;
}

/**
 * 슬롯 목록 검증 + 정확 중복 제거. setMemberSchedule과 동일 규칙(요일 0~6, 시각 6~22시, 분 0/30).
 * 성공 시 { slots }, 실패 시 { error }.
 */
export function normalizeTeamSlots(slots: Slot[]): { slots: Slot[] } | { error: string } {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const s of slots ?? []) {
    const weekday = Number(s.weekday), hour = Number(s.hour), minute = Number(s.minute);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "요일이 올바르지 않아요." };
    if (!Number.isInteger(hour) || hour < 6 || hour > 22) return { error: "수업 시간은 오전 6시~오후 10시 사이여야 해요." };
    if (minute !== 0 && minute !== 30) return { error: "분은 정각 또는 30분만 가능해요." };
    const k = `${weekday}|${hour}|${minute}`;
    if (!seen.has(k)) { seen.add(k); out.push({ weekday, hour, minute }); }
  }
  if (out.length === 0) return { error: "수업 요일·시간을 하나 이상 선택해주세요." };
  return { slots: out };
}
