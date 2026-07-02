"use server";
import { sb, getTrainerContext } from "@/lib/data/db";
import { ensureOwner } from "@/lib/auth/guard";
import { markNotificationRead } from "@/lib/data/groups/notifications";
import { getProposeSlots } from "@/lib/data/groups/scheduling";
import { getStudioCalendarWeek, type StudioCalendarWeek } from "@/lib/data/groups/console";
import { getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getChatRoom } from "@/lib/data/groups/chat";
import { issueMembership, recordPayment } from "@/lib/data/groups/owner-ops-actions";
import { getMemberSchedule, getTeamCandidates, type MemberScheduleView } from "@/lib/data/groups/owner-ops";
import type { ChatRoomView, MemberDetailView, PaymentMethod } from "@/lib/types";

/** Mark one of the owner's in-app notifications read (topbar bell). */
export async function markConsoleNotifRead(id: string): Promise<{ ok: boolean }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false };
  await markNotificationRead(id, "trainer", t.id);
  return { ok: true };
}

/** Client-callable wrapper so the members island can load a detail panel on selection. */
export async function loadMemberDetail(id: string): Promise<MemberDetailView | null> {
  if (!(await ensureOwner())) return null;
  return getMemberDetail(id);
}

/** Issue a membership then record its first payment in one step (console 발급 modal). */
export async function consoleIssueMembership(
  memberId: string,
  productId: string,
  method: PaymentMethod,
  amount?: number,
  discountLabel?: string, // 할인 라벨 스냅샷("가족 −50,000원") → 발급 이벤트 note + payments.discount_label
): Promise<{ ok: boolean; error?: string }> {
  const issued = await issueMembership(memberId, productId, discountLabel);
  if (!issued.ok || !issued.membershipId) return { ok: false, error: issued.error ?? "발급에 실패했어요" };
  const paid = await recordPayment({ membershipId: issued.membershipId, method, amount, discountLabel });
  if (!paid.ok) {
    // 보상: 결제 없는 회원권이 남으면 재시도 시 중복 발급된다(감사 #18) — 방금 발급분을 회수.
    await sb.from("membership_events").delete().eq("membership_id", issued.membershipId);
    await sb.from("memberships").delete().eq("id", issued.membershipId);
    return { ok: false, error: paid.error ?? "결제 기록에 실패했어요. 처음부터 다시 시도해주세요." };
  }
  return { ok: true };
}

/** Client-callable wrapper so the messages island can load a room on thread switch. */
export async function loadConsoleRoom(threadId: string): Promise<ChatRoomView | null> {
  if (!(await ensureOwner())) return null;
  return getChatRoom(threadId);
}

/** 캘린더 수업 클릭 → 일정 조율 요청 모달용 후보 시간 온디맨드 로드(모바일 propose와 동일 게터 재사용). */
export async function loadProposeSlots(sessionId: string) {
  if (!(await ensureOwner())) return null;
  return getProposeSlots(sessionId);
}

/** 수업 완료 회원 확인 서명 이미지 온디맨드 로드 — 월 캘린더 페이로드에 서명(수 KB×수백 건)을 싣지 않기 위해. */
export async function loadSessionSignature(sessionId: string): Promise<string | null> {
  const t = await getTrainerContext();
  if (!t) return null;
  const { data } = await sb.from("sessions").select("member_signature, trainer_id").eq("id", sessionId).maybeSingle();
  if (!data) return null;
  if (t.role !== "owner" && data.trainer_id !== t.id) return null; // 강사는 본인 수업만
  return (data.member_signature as string | null) ?? null;
}

/** 콘솔(클라이언트)에서 회원 선택 시 정기 일정 편집용 슬롯 로드 — 대표만. */
export async function loadMemberSchedule(memberId: string): Promise<MemberScheduleView | null> {
  if (!(await ensureOwner())) return null;
  return getMemberSchedule(memberId);
}

/** 콘솔 팀 만들기 파트너 후보(같은 강사·활성·미팀) 로드 — 대표만. 모바일과 동일 기준. */
export async function loadTeamCandidates(memberId: string): Promise<{ id: string; name: string }[]> {
  if (!(await ensureOwner())) return [];
  return getTeamCandidates(memberId);
}

/** 콘솔 캘린더 주간 뷰 네비게이션 — 대표만. */
export async function loadStudioWeek(offset: number): Promise<StudioCalendarWeek | null> {
  if (!(await ensureOwner())) return null;
  return getStudioCalendarWeek(offset);
}
