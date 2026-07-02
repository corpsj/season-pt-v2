"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sb, getMemberContext } from "@/lib/data/db";
import { notifyTrainersOfRequest, notifyRequestResult, notifyTeamOfScheduleChange } from "@/lib/data/groups/notifications";
import { hasSlotConflict, moveSessionWithTombstone, claimCancelSession } from "@/lib/data/groups/session-mutations";
import { slotLabel } from "@/lib/data/groups/scheduling";
import {
  NOTICE_READ_COOKIE,
  NOTIF_READY_KEYS,
  clockLabel,
  loadNewMemberMessages,
  ensureMemberThread,
  readMemberNotifPrefs,
} from "./member";
import { markNotificationRead } from "./notifications";
import type { ChatMessageView } from "@/lib/types";

type Result = { ok: boolean; error?: string };

const YEAR = 60 * 60 * 24 * 365;
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: YEAR,
};

async function requireMember() {
  const m = await getMemberContext();
  if (!m) throw new Error("UNAUTHENTICATED");
  return m;
}

/** Verify the request belongs to one of this member's sessions and is a pending trainer request. */
async function loadOwnTrainerRequest(requestId: string, memberId: string) {
  const { data: req } = await sb
    .from("schedule_change_requests")
    .select("id, session_id, proposed_slots, requester_type, requester_id, type, status, original_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.requester_type !== "trainer" || req.status !== "pending") return null;
  const { data: sm } = await sb
    .from("session_members")
    .select("member_id")
    .eq("session_id", req.session_id)
    .eq("member_id", memberId)
    .maybeSingle();
  if (!sm) return null;
  return req;
}

/**
 * Member accepts a trainer request. For 'change' → move the session to a proposed slot (+tombstone,
 * conflict guard). For 'cancel' → actually cancel the session (강사 발의 취소는 무차감, 감사 H7).
 * Notifies the requesting trainer of the outcome (감사 H8).
 */
export async function acceptMemberChange(requestId: string, slotIso?: string): Promise<Result> {
  const me = await requireMember();
  const req = await loadOwnTrainerRequest(requestId, me.memberId);
  if (!req) return { ok: false, error: "요청을 찾을 수 없어요" };

  // 대상 세션이 아직 예정 상태인지 확인(이미 진행/취소됐으면 요청 정리, 감사 C1).
  const { data: session } = await sb
    .from("sessions")
    .select("trainer_id, status, scheduled_at")
    .eq("id", req.session_id)
    .maybeSingle();
  if (!session || session.status !== "scheduled") {
    await sb.from("schedule_change_requests").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", req.id);
    return { ok: false, error: "이미 진행됐거나 처리된 수업이에요" };
  }

  // 요청 생성 후 수업 시간이 이미 바뀌었으면(다른 합의가 먼저 이뤄짐) 낡은 제안 — 수락하면 합의된
  // 시간이 옛 제안 시각으로 조용히 되돌아간다(감사 high #2). 정리하고 알린다.
  if (req.original_at && session.scheduled_at !== req.original_at) {
    await sb.from("schedule_change_requests").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", req.id);
    return { ok: false, error: "수업 시간이 이미 변경돼 이 제안은 만료됐어요" };
  }

  let changeDetail: string | undefined;
  if (req.type === "cancel") {
    // 강사가 요청한 취소 — 회원 승인 시 실제로 세션을 취소한다(무차감: 스튜디오 발의).
    const cancelled = await claimCancelSession(req.session_id);
    if (!cancelled) {
      await sb.from("schedule_change_requests").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", req.id);
      return { ok: false, error: "이미 처리된 수업이에요" };
    }
  } else {
    const slots = Array.isArray(req.proposed_slots) ? (req.proposed_slots as string[]) : [];
    const chosen = slotIso && slots.includes(slotIso) ? slotIso : slots[0];
    if (!chosen) return { ok: false, error: "선택한 시간이 올바르지 않아요" };
    if (await hasSlotConflict(session.trainer_id as string, chosen, req.session_id)) {
      return { ok: false, error: "그 시간에 이미 다른 수업이 있어요" };
    }
    const moved = await moveSessionWithTombstone(req.session_id, chosen);
    if (!moved) {
      await sb.from("schedule_change_requests").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", req.id);
      return { ok: false, error: "이미 처리된 수업이에요" };
    }
    changeDetail = `→ ${slotLabel(chosen)}`;
  }

  await sb
    .from("schedule_change_requests")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", req.id);
  await notifyRequestResult({
    recipientType: "trainer",
    recipientId: req.requester_id as string,
    kind: (req.type as "change" | "cancel") ?? "change",
    accepted: true,
  }).catch(() => {});
  // 2:1 팀이면 수락한 본인 외 파트너에게 결과 통지(무조건 함께 움직이므로).
  await notifyTeamOfScheduleChange({
    sessionId: req.session_id,
    exceptMemberId: me.memberId,
    kind: (req.type as "change" | "cancel") ?? "change",
    detail: changeDetail,
  }).catch(() => {});

  revalidatePath("/m");
  revalidatePath("/m/receive");
  return { ok: true };
}

/** Member rejects a trainer change/cancel request. Notifies the requesting trainer (감사 H8). */
export async function rejectMemberChange(requestId: string): Promise<Result> {
  const me = await requireMember();
  const req = await loadOwnTrainerRequest(requestId, me.memberId);
  if (!req) return { ok: false, error: "요청을 찾을 수 없어요" };

  await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", req.id);
  await notifyRequestResult({
    recipientType: "trainer",
    recipientId: req.requester_id as string,
    kind: (req.type as "change" | "cancel") ?? "change",
    accepted: false,
  }).catch(() => {});

  revalidatePath("/m");
  revalidatePath("/m/receive");
  return { ok: true };
}

/**
 * Member submits a change/cancel request for one of their sessions.
 * type 'change' carries proposed slot ISO strings; 'cancel' carries none.
 */
export async function sendMemberRequest(input: {
  sessionId: string;
  type: "change" | "cancel";
  proposedSlots?: string[];
}): Promise<Result> {
  const me = await requireMember();
  if (!input.sessionId) return { ok: false, error: "수업을 찾을 수 없어요" };

  // Confirm the session is this member's.
  const { data: sm } = await sb
    .from("session_members")
    .select("member_id")
    .eq("session_id", input.sessionId)
    .eq("member_id", me.memberId)
    .maybeSingle();
  if (!sm) return { ok: false, error: "수업을 찾을 수 없어요" };

  if (input.type === "change" && !(input.proposedSlots && input.proposedSlots.length)) {
    return { ok: false, error: "변경할 시간을 선택해주세요" };
  }

  // 중복 방지: 같은 수업에 대기 중인 '회원' 요청이 있으면 막는다. 2:1 팀은 한 세션을 공유하므로
  // 내 요청뿐 아니라 파트너의 요청도 함께 막아야 서로 다른 시간으로 요청해 충돌하는 것을 방지한다.
  const { data: dupReq } = await sb
    .from("schedule_change_requests")
    .select("requester_id")
    .eq("session_id", input.sessionId)
    .eq("requester_type", "member")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (dupReq) {
    return dupReq.requester_id === me.memberId
      ? { ok: false, error: "이미 보낸 요청이 대기 중이에요." }
      : { ok: false, error: "팀원이 이미 일정 요청을 보냈어요. 처리된 뒤 다시 시도해주세요." };
  }

  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at, status")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (!session || session.status !== "scheduled") return { ok: false, error: "이미 처리된 수업이에요" };

  // 같은 수업의 대기 중 '트레이너 제안'은 이 요청이 대체한다(역제안) — 둘이 공존하면 어느 쪽이든
  // 늦게 수락될 때 세션이 다시 움직인다(감사 high #2). 회원의 새 요청이 곧 기존 제안 거절 의사.
  await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("session_id", input.sessionId)
    .eq("requester_type", "trainer")
    .eq("status", "pending");

  const { error } = await sb.from("schedule_change_requests").insert({
    session_id: input.sessionId,
    requester_type: "member",
    requester_id: me.memberId,
    type: input.type,
    status: "pending",
    original_at: session?.scheduled_at ?? null,
    proposed_slots: input.type === "change" ? input.proposedSlots ?? [] : [],
  });
  if (error) return { ok: false, error: "요청을 보내지 못했어요" };

  await notifyTrainersOfRequest(me.memberId, input.type).catch(() => {}); // best-effort 알림

  revalidatePath("/m");
  revalidatePath("/m/request");
  return { ok: true };
}

/** Member sends a chat message in their thread. */
export async function sendMemberChat(
  text: string
): Promise<{ ok: boolean; error?: string; message?: ChatMessageView }> {
  const me = await requireMember();
  const body = text.trim();
  if (!body) return { ok: false, error: "메시지를 입력해주세요" };

  // Ensure the member↔trainer thread exists (created on first send if missing).
  const threadId = await ensureMemberThread(me.memberId);
  if (!threadId) return { ok: false, error: "담당 선생님이 없어 대화를 시작할 수 없어요" };

  const now = new Date().toISOString();
  const { data: inserted, error } = await sb
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender_type: "member",
      sender_id: me.memberId,
      text: body,
      read_by_member: true,
      read_by_trainer: false,
    })
    .select("id, created_at")
    .single();
  if (error || !inserted) return { ok: false, error: "메시지를 보내지 못했어요" };

  await sb
    .from("chat_threads")
    .update({ last_message: body, last_at: now, updated_at: now })
    .eq("id", threadId);

  revalidatePath("/m/chat");
  return {
    ok: true,
    message: {
      id: inserted.id as string,
      mine: true,
      text: body,
      time: clockLabel(inserted.created_at as string),
      createdAt: inserted.created_at as string,
    },
  };
}

/** Client-callable poll for new messages in the member's thread. */
export async function pollMemberMessages(
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  return loadNewMemberMessages(sinceISO);
}

/* ----------------------------- my page (/m/my) ----------------------------- */

/** Mark all currently-unread notices as read (per device). Called when 공지사항 opens. */
export async function markNoticesRead(): Promise<void> {
  await requireMember();
  const c = await cookies();
  let ids: string[] = [];
  const raw = c.get(NOTICE_READ_COOKIE)?.value;
  if (raw) {
    try {
      const a: unknown = JSON.parse(raw);
      if (Array.isArray(a)) ids = a.filter((x): x is string => typeof x === "string");
    } catch {
      /* ignore malformed cookie */
    }
  }
  const { data: noticeRows } = await sb.from("notices").select("id").eq("active", true);
  const activeIds = (noticeRows ?? []).map((n) => n.id as string);
  const merged = [...new Set([...ids, ...activeIds])];
  c.set(NOTICE_READ_COOKIE, JSON.stringify(merged), COOKIE_OPTS);
  // Only refresh the My page (for the unread badge/stat). The notices screen
  // keeps its unread highlight for this visit; it clears on the next open.
  revalidatePath("/m/my");
}

/** Mark a single in-app notification as read (member only). */
export async function markNotifRead(id: string): Promise<void> {
  const me = await requireMember();
  await markNotificationRead(id, "member", me.memberId);
  revalidatePath("/m/my");
}

/** Toggle one notification setting (per member, DB-backed so the scan honors it). */
export async function setMemberNotifSetting(key: string, on: boolean): Promise<Result> {
  const me = await requireMember();
  // Only wired notifications are settable; "준비 중" items have no live toggle.
  if (!NOTIF_READY_KEYS.includes(key)) return { ok: false, error: "아직 준비 중인 알림이에요" };
  const prefs = await readMemberNotifPrefs(me.memberId);
  prefs[key] = on;
  const { error } = await sb.from("members").update({ notif_prefs: prefs }).eq("id", me.memberId);
  if (error) return { ok: false, error: "설정을 저장하지 못했어요" };
  revalidatePath("/m/my/notifications");
  return { ok: true };
}
