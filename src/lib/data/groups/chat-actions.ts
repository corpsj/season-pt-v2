"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, getMemberContext } from "@/lib/data/db";
import {
  kstClock,
  loadNewTrainerMessages,
  getChatThreads,
  getChatUnread,
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

  // Scope: the thread must belong to this trainer.
  const { data: thread } = await sb
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("trainer_id", t.id)
    .maybeSingle();
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

/** Mark a thread's incoming messages as read by the trainer. */
export async function markThreadRead(
  threadId: string
): Promise<{ ok: boolean }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false };
  const { data: thread } = await sb
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("trainer_id", t.id)
    .maybeSingle();
  if (!thread) return { ok: false };

  await sb
    .from("chat_messages")
    .update({ read_by_trainer: true })
    .eq("thread_id", threadId)
    .eq("read_by_trainer", false)
    .eq("sender_type", "member");

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
