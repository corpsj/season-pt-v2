import "server-only";
import { sb, getTrainerContext, kstDateISO, todayISO } from "@/lib/data/db";
import type {
  AvatarTone,
  ChatThreadView,
  ChatMessageView,
  ChatRoomView,
  Me,
  TeamAvatar,
} from "@/lib/types";

/* ------------------------------ helpers ------------------------------ */

/** Clock label in KST, e.g. "오후 2:14" / "오전 11:30". */
export function kstClock(iso: string | Date): string {
  const d = new Date(typeof iso === "string" ? iso : iso.getTime());
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const mm = m.toString().padStart(2, "0");
  if (h < 12) return `오전 ${h === 0 ? 12 : h}:${mm}`;
  if (h === 12) return `오후 12:${mm}`;
  return `오후 ${h - 12}:${mm}`;
}

/** Thread-list time: today→clock, yesterday→"어제", older→"M월 D일". */
function threadTimeLabel(iso: string | null): string {
  if (!iso) return "";
  const day = kstDateISO(iso);
  const today = todayISO();
  if (day === today) return kstClock(iso);
  const yesterday = kstDateISO(new Date(Date.now() - 86400000));
  if (day === yesterday) return "어제";
  const [, mo, d] = day.split("-");
  return `${Number(mo)}월 ${Number(d)}일`;
}

type MemberRow = { id: string; name: string; avatar_tone: AvatarTone };

function initialOf(name: string): string {
  return name.slice(0, 1);
}

/** Build a TeamAvatar from two member rows (2:1). */
function teamFrom(a: MemberRow, b: MemberRow): TeamAvatar {
  return {
    init1: initialOf(a.name),
    tone1: a.avatar_tone,
    init2: initialOf(b.name),
    tone2: b.avatar_tone,
  };
}

/* -------------------------------- me -------------------------------- */
export async function getMe(): Promise<Me> {
  const t = await getTrainerContext();
  if (!t) throw new Error("no trainer context");
  return {
    role: t.role === "owner" ? "owner" : "trainer",
    name: t.displayName,
    roleLabel: t.role === "owner" ? "대표" : "트레이너",
    trainerRole: t.role,
    isOwner: t.role === "owner",
    trainerId: t.id,
  };
}

/** Count of this trainer's members (담당회원 pill). */
export async function getMembersCount(): Promise<number> {
  const t = await getTrainerContext();
  if (!t) return 0;
  const { count } = await sb
    .from("member_trainers")
    .select("member_id", { count: "exact", head: true })
    .eq("trainer_id", t.id);
  return count ?? 0;
}

/* ------------------------------ threads ------------------------------ */
async function loadThreadParticipants(
  threadIds: string[]
): Promise<Map<string, MemberRow[]>> {
  const byThread = new Map<string, MemberRow[]>();
  if (threadIds.length === 0) return byThread;
  const { data: parts } = await sb
    .from("chat_participants")
    .select("thread_id, member_id")
    .in("thread_id", threadIds);
  const rows = parts ?? [];
  const memberIds = [...new Set(rows.map((r) => r.member_id as string))];
  const memberById = new Map<string, MemberRow>();
  if (memberIds.length > 0) {
    const { data: members } = await sb
      .from("members")
      .select("id, name, avatar_tone")
      .in("id", memberIds);
    for (const m of members ?? []) {
      memberById.set(m.id as string, {
        id: m.id as string,
        name: m.name as string,
        avatar_tone: (m.avatar_tone as AvatarTone) ?? "sage",
      });
    }
  }
  for (const r of rows) {
    const m = memberById.get(r.member_id as string);
    if (!m) continue;
    const list = byThread.get(r.thread_id as string) ?? [];
    list.push(m);
    byThread.set(r.thread_id as string, list);
  }
  return byThread;
}

export async function getChatThreads(): Promise<ChatThreadView[]> {
  const t = await getTrainerContext();
  if (!t) return [];

  const { data: threadRows } = await sb
    .from("chat_threads")
    .select("id, type, last_message, last_at")
    .eq("trainer_id", t.id)
    .order("last_at", { ascending: false, nullsFirst: false });
  const threads = threadRows ?? [];
  if (threads.length === 0) return [];

  const threadIds = threads.map((r) => r.id as string);
  const participants = await loadThreadParticipants(threadIds);

  // Unread = count of incoming messages not yet read by the trainer, per thread.
  const unreadByThread = new Map<string, number>();
  const { data: unreadRows } = await sb
    .from("chat_messages")
    .select("thread_id")
    .in("thread_id", threadIds)
    .eq("read_by_trainer", false)
    .eq("sender_type", "member");
  for (const r of unreadRows ?? []) {
    const k = r.thread_id as string;
    unreadByThread.set(k, (unreadByThread.get(k) ?? 0) + 1);
  }

  return threads.map((row) => {
    const id = row.id as string;
    const members = participants.get(id) ?? [];
    const isTeam = row.type === "2on1";
    if (isTeam && members.length >= 2) {
      const [a, b] = members;
      return {
        id,
        name: `${a.name}·${b.name}`,
        initial: initialOf(a.name),
        avatarTone: a.avatar_tone,
        isTeam: true,
        team: teamFrom(a, b),
        preview: (row.last_message as string) ?? "",
        time: threadTimeLabel(row.last_at as string | null),
        unread: unreadByThread.get(id) ?? 0,
      } satisfies ChatThreadView;
    }
    const m = members[0];
    return {
      id,
      name: m?.name ?? "",
      initial: m ? initialOf(m.name) : "",
      avatarTone: m?.avatar_tone ?? "sage",
      isTeam: false,
      preview: (row.last_message as string) ?? "",
      time: threadTimeLabel(row.last_at as string | null),
      unread: unreadByThread.get(id) ?? 0,
    } satisfies ChatThreadView;
  });
}

export async function getChatUnread(): Promise<number> {
  const t = await getTrainerContext();
  if (!t) return 0;
  const { data: threadRows } = await sb
    .from("chat_threads")
    .select("id")
    .eq("trainer_id", t.id);
  const ids = (threadRows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const { count } = await sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .eq("read_by_trainer", false)
    .eq("sender_type", "member");
  return count ?? 0;
}

/* ------------------------------- room ------------------------------- */
export async function getChatRoom(threadId: string): Promise<ChatRoomView> {
  const t = await getTrainerContext();
  if (!t) throw new Error("no trainer context");

  const { data: thread } = await sb
    .from("chat_threads")
    .select("id, type, trainer_id")
    .eq("id", threadId)
    .eq("trainer_id", t.id)
    .maybeSingle();
  if (!thread) throw new Error("thread not found");

  const isTeam = thread.type === "2on1";
  const participants = (await loadThreadParticipants([threadId])).get(threadId) ?? [];

  // Build a per-member schedule label for the room subtitle (1:1).
  const memberIds = participants.map((m) => m.id);
  const sub = await scheduleSub(t.id, memberIds, isTeam);

  // Mark thread as read on open.
  await sb
    .from("chat_messages")
    .update({ read_by_trainer: true })
    .eq("thread_id", threadId)
    .eq("read_by_trainer", false)
    .eq("sender_type", "member");

  const { data: msgRows } = await sb
    .from("chat_messages")
    .select("id, sender_type, sender_id, text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const senderName = new Map<string, string>();
  for (const m of participants) senderName.set(m.id, m.name);

  const messages: ChatMessageView[] = (msgRows ?? []).map((row) => {
    const mine = row.sender_type === "trainer";
    return {
      id: row.id as string,
      mine,
      sender:
        isTeam && !mine ? senderName.get(row.sender_id as string) : undefined,
      text: row.text as string,
      time: kstClock(row.created_at as string),
      createdAt: row.created_at as string,
    };
  });

  const cursor =
    msgRows && msgRows.length
      ? (msgRows[msgRows.length - 1].created_at as string)
      : null;

  if (isTeam && participants.length >= 2) {
    const [a, b] = participants;
    return {
      threadId,
      name: `${a.name}·${b.name}`,
      isTeam: true,
      team: teamFrom(a, b),
      initial: initialOf(a.name),
      avatarTone: a.avatar_tone,
      sub,
      messages,
      cursor,
    };
  }
  const m = participants[0];
  return {
    threadId,
    name: m?.name ?? "",
    isTeam: false,
    initial: m ? initialOf(m.name) : "",
    avatarTone: m?.avatar_tone ?? "sage",
    sub,
    messages,
    cursor,
  };
}

/** New messages in a thread at/after `sinceISO` (or all if null), marking incoming as read. */
export async function loadNewTrainerMessages(
  threadId: string,
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  const t = await getTrainerContext();
  if (!t) return [];

  const { data: thread } = await sb
    .from("chat_threads")
    .select("id, type")
    .eq("id", threadId)
    .eq("trainer_id", t.id)
    .maybeSingle();
  if (!thread) return [];

  const isTeam = thread.type === "2on1";
  const participants = (await loadThreadParticipants([threadId])).get(threadId) ?? [];
  const senderName = new Map<string, string>();
  for (const m of participants) senderName.set(m.id, m.name);

  let q = sb
    .from("chat_messages")
    .select("id, sender_type, sender_id, text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { data: msgRows } = await q;

  // Mark incoming (member) messages as read now that they're delivered.
  await sb
    .from("chat_messages")
    .update({ read_by_trainer: true })
    .eq("thread_id", threadId)
    .eq("read_by_trainer", false)
    .eq("sender_type", "member");

  return (msgRows ?? []).map((row) => {
    const mine = row.sender_type === "trainer";
    return {
      id: row.id as string,
      mine,
      sender:
        isTeam && !mine ? senderName.get(row.sender_id as string) : undefined,
      text: row.text as string,
      time: kstClock(row.created_at as string),
      createdAt: row.created_at as string,
    } satisfies ChatMessageView;
  });
}

/** Subtitle like "1:1 PT · 매주 화·토 오후 8시" from the member's schedule. */
const WD = ["일", "월", "화", "수", "목", "금", "토"];
async function scheduleSub(
  trainerId: string,
  memberIds: string[],
  isTeam: boolean
): Promise<string> {
  const kind = isTeam ? "2:1" : "1:1";
  if (memberIds.length === 0) return `${kind} PT`;

  const { data: smRows } = await sb
    .from("schedule_members")
    .select("schedule_id")
    .in("member_id", memberIds);
  const schedIds = [...new Set((smRows ?? []).map((r) => r.schedule_id as string))];
  if (schedIds.length === 0) return `${kind} PT`;

  const { data: scheds } = await sb
    .from("schedules")
    .select("weekday, hour, type")
    .eq("trainer_id", trainerId)
    .in("id", schedIds)
    .order("weekday", { ascending: true });
  const rows = scheds ?? [];
  if (rows.length === 0) return `${kind} PT`;

  const days = [...new Set(rows.map((r) => WD[r.weekday as number]))].join("·");
  const hour = rows[0].hour as number;
  const hLabel =
    hour < 12
      ? `오전 ${hour === 0 ? 12 : hour}시`
      : hour === 12
      ? "오후 12시"
      : `오후 ${hour - 12}시`;
  return `${kind} PT · 매주 ${days} ${hLabel}`;
}
