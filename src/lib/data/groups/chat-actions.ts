"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, getMemberContext } from "@/lib/data/db";
import {
  kstClock,
  loadNewTrainerMessages,
  getChatThreads,
  getChatUnread,
  ensureChatThread,
} from "@/lib/data/groups/chat";
import { getMemberChatUnread } from "@/lib/data/groups/member";
import type { ChatMessageView, ChatThreadView } from "@/lib/types";

/** Send a trainer message into a thread + bump the thread preview/time. */
export async function sendChat(
  threadId: string,
  text: string
): Promise<{ ok: boolean; error?: string; message?: ChatMessageView }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요." };
  const body = text.trim();
  if (!body) return { ok: false, error: "메시지를 입력해 주세요." };

  // Scope: the thread must belong to this trainer (owner may post to any thread).
  let sq = sb.from("chat_threads").select("id").eq("id", threadId);
  if (t.role !== "owner") sq = sq.eq("trainer_id", t.id);
  const { data: thread } = await sq.maybeSingle();
  if (!thread) return { ok: false, error: "대화를 찾을 수 없어요." };

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await sb
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender_type: "trainer",
      sender_id: t.id,
      text: body,
      read_by_trainer: true,
      read_by_member: false,
    })
    .select("id, created_at")
    .single();
  if (insErr || !inserted) return { ok: false, error: "전송에 실패했어요." };

  await sb
    .from("chat_threads")
    .update({ last_message: `나: ${body}`, last_at: now, updated_at: now })
    .eq("id", threadId);

  revalidatePath("/t/chat");
  revalidatePath(`/t/chat/${threadId}`);
  return {
    ok: true,
    message: {
      id: inserted.id as string,
      mine: true,
      text: body,
      time: kstClock(inserted.created_at as string),
      createdAt: inserted.created_at as string,
    },
  };
}

/** Delete a chat thread (participants/messages cascade). Owner may delete any thread; other trainers only their own. */
export async function deleteChatThread(
  threadId: string
): Promise<{ ok: boolean; error?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요." };

  let q = sb.from("chat_threads").select("id").eq("id", threadId);
  if (t.role !== "owner") q = q.eq("trainer_id", t.id);
  const { data: thread } = await q.maybeSingle();
  if (!thread) return { ok: false, error: "대화를 찾을 수 없어요." };

  const { error } = await sb.from("chat_threads").delete().eq("id", threadId);
  if (error) return { ok: false, error: "삭제에 실패했어요." };

  revalidatePath("/t/chat");
  revalidatePath(`/t/chat/${threadId}`);
  return { ok: true };
}

/** Mark a thread's incoming messages as read by the trainer. */
export async function markThreadRead(
  threadId: string
): Promise<{ ok: boolean }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false };
  let mq = sb.from("chat_threads").select("id, trainer_id").eq("id", threadId);
  if (t.role !== "owner") mq = mq.eq("trainer_id", t.id);
  const { data: thread } = await mq.maybeSingle();
  if (!thread) return { ok: false };

  // 스레드 소유 강사일 때만 읽음 표시 — read_by_trainer는 강사·대표 공용이라, 대표가 남의 스레드를
  // 읽음처리하면 담당 강사 배지가 사라진다(감사 H11 회귀 방지, getChatRoom·loadNewTrainerMessages와 동일 규칙).
  if (t.id === (thread.trainer_id as string)) {
    await sb
      .from("chat_messages")
      .update({ read_by_trainer: true })
      .eq("thread_id", threadId)
      .eq("read_by_trainer", false)
      .eq("sender_type", "member");
  }

  revalidatePath("/t/chat");
  return { ok: true };
}

/** Client-callable poll for new messages in a trainer thread. */
export async function pollTrainerMessages(
  threadId: string,
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  return loadNewTrainerMessages(threadId, sinceISO);
}

/** Client-callable refresh of the trainer's thread list. */
export async function pollChatThreads(): Promise<ChatThreadView[]> {
  return getChatThreads();
}

/** Client-callable unread count; detects trainer vs member from the session. */
export async function pollChatUnread(): Promise<number> {
  const t = await getTrainerContext();
  if (t) return getChatUnread();
  const m = await getMemberContext();
  if (m) return getMemberChatUnread();
  return 0;
}

/**
 * Start (or reopen) a chat with a member from the trainer side, returning the thread id
 * so the client can navigate to the room. Owner may message any member; other trainers
 * only their assigned members.
 */
export async function startChatWithMember(
  memberId: string
): Promise<{ ok: boolean; threadId?: string; error?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요." };
  if (!memberId) return { ok: false, error: "회원을 찾을 수 없어요." };

  if (t.role === "owner") {
    const { data: m } = await sb
      .from("members")
      .select("id")
      .eq("id", memberId)
      .maybeSingle();
    if (!m) return { ok: false, error: "회원을 찾을 수 없어요." };
  } else {
    const { data: link } = await sb
      .from("member_trainers")
      .select("member_id")
      .eq("trainer_id", t.id)
      .eq("member_id", memberId)
      .maybeSingle();
    if (!link) return { ok: false, error: "담당 회원이 아니에요." };
  }

  const threadId = await ensureChatThread(memberId);
  if (!threadId) return { ok: false, error: "대화를 시작할 수 없어요." };

  revalidatePath("/t/chat");
  return { ok: true, threadId };
}
