"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sb, getMemberContext } from "@/lib/data/db";
import {
  NOTICE_READ_COOKIE,
  NOTICE_UNREAD_IDS,
  NOTIF_COOKIE,
  NOTIF_KEYS,
  clockLabel,
  loadNewMemberMessages,
} from "./member";
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
    .select("id, session_id, proposed_slots, requester_type, status")
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
 * Member accepts a trainer change request: pick a proposed slot, move the session,
 * resolve the request as accepted.
 */
export async function acceptMemberChange(requestId: string, slotIso?: string): Promise<Result> {
  const me = await requireMember();
  const req = await loadOwnTrainerRequest(requestId, me.memberId);
  if (!req) return { ok: false, error: "요청을 찾을 수 없어요" };

  const slots = Array.isArray(req.proposed_slots) ? (req.proposed_slots as string[]) : [];
  const chosen = slotIso && slots.includes(slotIso) ? slotIso : slots[0];

  if (chosen) {
    await sb.from("sessions").update({ scheduled_at: chosen }).eq("id", req.session_id);
  }
  await sb
    .from("schedule_change_requests")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", req.id);

  revalidatePath("/m");
  revalidatePath("/m/receive");
  return { ok: true };
}

/** Member rejects a trainer change request. */
export async function rejectMemberChange(requestId: string): Promise<Result> {
  const me = await requireMember();
  const req = await loadOwnTrainerRequest(requestId, me.memberId);
  if (!req) return { ok: false, error: "요청을 찾을 수 없어요" };

  await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", req.id);

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

  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at")
    .eq("id", input.sessionId)
    .maybeSingle();

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

  const { data: cp } = await sb
    .from("chat_participants")
    .select("thread_id, chat_threads(id, updated_at)")
    .eq("member_id", me.memberId);
  const threads = (cp ?? [])
    .map((r) => (r as unknown as {chat_threads?: { id: string; updated_at: string } }).chat_threads)
    .filter((t): t is { id: string; updated_at: string } => !!t)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  const thread = threads[0];
  if (!thread) return { ok: false, error: "대화방을 찾을 수 없어요" };

  const now = new Date().toISOString();
  const { data: inserted, error } = await sb
    .from("chat_messages")
    .insert({
      thread_id: thread.id,
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
    .eq("id", thread.id);

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
  const merged = [...new Set([...ids, ...NOTICE_UNREAD_IDS])];
  c.set(NOTICE_READ_COOKIE, JSON.stringify(merged), COOKIE_OPTS);
  // Only refresh the My page (for the unread badge/stat). The notices screen
  // keeps its unread highlight for this visit; it clears on the next open.
  revalidatePath("/m/my");
}

/** Toggle one notification setting (per device). */
export async function setMemberNotifSetting(key: string, on: boolean): Promise<Result> {
  await requireMember();
  if (!NOTIF_KEYS.includes(key)) return { ok: false, error: "알 수 없는 설정이에요" };
  const c = await cookies();
  let obj: Record<string, boolean> = {};
  const raw = c.get(NOTIF_COOKIE)?.value;
  if (raw) {
    try {
      const o: unknown = JSON.parse(raw);
      if (o && typeof o === "object" && !Array.isArray(o)) obj = o as Record<string, boolean>;
    } catch {
      /* ignore malformed cookie */
    }
  }
  obj[key] = on;
  c.set(NOTIF_COOKIE, JSON.stringify(obj), COOKIE_OPTS);
  revalidatePath("/m/my/notifications");
  return { ok: true };
}
