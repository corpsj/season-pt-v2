"use server";
import { getTrainerContext } from "@/lib/data/db";
import { ensureOwner } from "@/lib/auth/guard";
import { markNotificationRead } from "@/lib/data/groups/notifications";
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
): Promise<{ ok: boolean; error?: string }> {
  const issued = await issueMembership(memberId, productId);
  if (!issued.ok || !issued.membershipId) return { ok: false, error: issued.error ?? "발급에 실패했어요" };
  const paid = await recordPayment({ membershipId: issued.membershipId, method });
  if (!paid.ok) return { ok: false, error: paid.error ?? "결제 기록에 실패했어요" };
  return { ok: true };
}

/** Client-callable wrapper so the messages island can load a room on thread switch. */
export async function loadConsoleRoom(threadId: string): Promise<ChatRoomView | null> {
  if (!(await ensureOwner())) return null;
  return getChatRoom(threadId);
}
