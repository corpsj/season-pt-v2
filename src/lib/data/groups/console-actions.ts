"use server";
import { sb, getTrainerContext } from "@/lib/data/db";
import { ensureOwner } from "@/lib/auth/guard";
import { markNotificationRead } from "@/lib/data/groups/notifications";
import { getProposeSlots } from "@/lib/data/groups/scheduling";
import { getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getChatRoom } from "@/lib/data/groups/chat";
import { issueMembership, recordPayment } from "@/lib/data/groups/owner-ops-actions";
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
): Promise<{ ok: boolean; error?: string }> {
  const issued = await issueMembership(memberId, productId);
  if (!issued.ok || !issued.membershipId) return { ok: false, error: issued.error ?? "발급에 실패했어요" };
  const paid = await recordPayment({ membershipId: issued.membershipId, method, amount });
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
