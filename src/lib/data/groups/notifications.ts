import { sb, todayISO, dayDiff } from "@/lib/data/db";
import { isLowSessions, isExpiringSoon } from "@/lib/data/notify";

async function settings() {
  const { data } = await sb.from("studio_settings").select("notif_session, notif_expiry").eq("id", 1).maybeSingle();
  return { session: data?.notif_session ?? true, expiry: data?.notif_expiry ?? true };
}

async function trainersOf(memberId: string): Promise<string[]> {
  const { data } = await sb.from("member_trainers").select("trainer_id").eq("member_id", memberId);
  return (data ?? []).map((r) => r.trainer_id as string);
}

async function hasUnread(membershipId: string, type: "low_sessions" | "expiring"): Promise<boolean> {
  const { data } = await sb.from("notifications").select("id").eq("membership_id", membershipId).eq("type", type).eq("status", "unread").limit(1).maybeSingle();
  return !!data;
}

/** 잔여 ≤3 알림(회원+담당 선생님). dedup: 같은 회원권 unread 있으면 skip. */
export async function notifyLowSessions(membershipId: string, memberId: string, remaining: number): Promise<void> {
  if (!isLowSessions(remaining)) return;
  if (!(await settings()).session) return;
  if (await hasUnread(membershipId, "low_sessions")) return;
  const common = { type: "low_sessions", title: "잔여 수업 임박", body: `남은 수업이 ${remaining}회예요.`, membership_id: membershipId };
  const rows = [
    { recipient_type: "member", recipient_id: memberId, ...common },
    ...(await trainersOf(memberId)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
  ];
  await sb.from("notifications").insert(rows);
}

/** 만료 N일 이내 active 회원권 → expiring 알림. dedup 적용. */
export async function scanExpiringMemberships(): Promise<{ created: number }> {
  if (!(await settings()).expiry) return { created: 0 };
  const { data: rows } = await sb.from("memberships").select("id, member_id, end_date").eq("status", "active");
  let created = 0;
  for (const m of rows ?? []) {
    const dDay = dayDiff(todayISO(), String(m.end_date));
    if (!isExpiringSoon(dDay)) continue;
    if (await hasUnread(m.id as string, "expiring")) continue;
    const common = { type: "expiring", title: "회원권 만료 임박", body: `만료 D-${dDay}예요.`, membership_id: m.id };
    const inserts = [
      { recipient_type: "member", recipient_id: m.member_id, ...common },
      ...(await trainersOf(m.member_id as string)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
    ];
    await sb.from("notifications").insert(inserts);
    created += inserts.length;
  }
  return { created };
}

export interface NotificationView { id: string; type: string; title: string; body: string | null; createdAt: string; status: string; }

export async function getNotifications(recipientType: "member" | "trainer", recipientId: string): Promise<NotificationView[]> {
  const { data } = await sb.from("notifications").select("id, type, title, body, created_at, status")
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId).eq("channel", "in_app")
    .order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((n) => ({ id: n.id as string, type: n.type as string, title: n.title as string, body: n.body as string | null, createdAt: n.created_at as string, status: n.status as string }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await sb.from("notifications").update({ status: "read", read_at: new Date().toISOString() }).eq("id", id);
}
