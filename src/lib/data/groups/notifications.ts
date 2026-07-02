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

/**
 * 최근 N일 내 같은 (회원권, 타입) 알림 존재 여부 — 읽음/안읽음 무관. 스캔형 알림(만료 임박)이
 * '읽으면 즉시 재발송'되는 스팸 루프를 막는다(감사 #31: unread만 보던 dedup의 구멍).
 */
async function hasRecent(membershipId: string, type: "low_sessions" | "expiring", days = 7): Promise<boolean> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await sb.from("notifications").select("id").eq("membership_id", membershipId).eq("type", type).gte("created_at", since).limit(1).maybeSingle();
  return !!data;
}

/** 회원별 알림 토글(미설정이면 기본 on). 스튜디오 게이트는 호출부에서 이미 적용됨. */
async function memberNotifEnabled(memberId: string, key: string): Promise<boolean> {
  const { data } = await sb.from("members").select("notif_prefs").eq("id", memberId).maybeSingle();
  const p = data?.notif_prefs as Record<string, boolean> | null;
  const v = p?.[key];
  return typeof v === "boolean" ? v : true;
}

/** 잔여 ≤3 알림(회원+담당 선생님). dedup: 같은 회원권 unread 있으면 skip. */
export async function notifyLowSessions(membershipId: string, memberId: string, remaining: number): Promise<void> {
  if (!isLowSessions(remaining)) return;
  if (!(await settings()).session) return;
  if (await hasUnread(membershipId, "low_sessions")) return;
  const common = { type: "low_sessions", title: "잔여 수업 임박", body: `남은 수업이 ${remaining}회예요.`, membership_id: membershipId };
  const rows = [
    // 회원 본인 알림은 회원 설정을 따른다(트레이너 알림은 항상 발송).
    ...((await memberNotifEnabled(memberId, "low_sessions")) ? [{ recipient_type: "member", recipient_id: memberId, ...common }] : []),
    ...(await trainersOf(memberId)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
  ];
  if (rows.length) await sb.from("notifications").insert(rows);
}

/** 만료 N일 이내 active 회원권 → expiring 알림. dedup 적용. */
export async function scanExpiringMemberships(): Promise<{ created: number }> {
  if (!(await settings()).expiry) return { created: 0 };
  const { data: rows } = await sb.from("memberships").select("id, member_id, end_date").eq("status", "active");
  let created = 0;
  for (const m of rows ?? []) {
    const dDay = dayDiff(todayISO(), String(m.end_date));
    if (!isExpiringSoon(dDay)) continue;
    if (await hasRecent(m.id as string, "expiring")) continue; // 읽어도 7일 내 재발송 금지(감사 #31)
    const common = { type: "expiring", title: "회원권 만료 임박", body: `만료 D-${dDay}예요.`, membership_id: m.id };
    const inserts = [
      // 회원 본인 알림은 회원 설정을 따른다(트레이너 알림은 항상 발송).
      ...((await memberNotifEnabled(m.member_id as string, "expiry_soon")) ? [{ recipient_type: "member", recipient_id: m.member_id, ...common }] : []),
      ...(await trainersOf(m.member_id as string)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
    ];
    if (inserts.length === 0) continue;
    await sb.from("notifications").insert(inserts);
    created += inserts.length;
  }
  return { created };
}

/** 회원이 일정 변경/취소를 요청하면 담당 선생님에게 알림(인박스 배지 외 피드 신호). best-effort. */
export async function notifyTrainersOfRequest(memberId: string, kind: "change" | "cancel"): Promise<void> {
  const trainers = await trainersOf(memberId);
  if (trainers.length === 0) return;
  const title = kind === "cancel" ? "수업 취소 요청" : "수업 변경 요청";
  const rows = trainers.map((tid) => ({
    recipient_type: "trainer", recipient_id: tid, type: "request",
    title, body: "회원이 일정 조율을 요청했어요. 요청함에서 확인해주세요.", channel: "in_app", status: "unread",
  }));
  await sb.from("notifications").insert(rows);
}

/**
 * 일정 요청의 처리 결과를 요청자에게 알림(수락/거절). 요청함·인박스만으로는 회원이 결과를 알 수 없어
 * 부당 노쇼/헛걸음을 부른다(감사 H8). 'request' 타입 재사용(스키마 변경 불필요). best-effort.
 */
export async function notifyRequestResult(input: {
  recipientType: "member" | "trainer";
  recipientId: string;
  kind: "change" | "cancel";
  accepted: boolean;
  detail?: string; // 변경 시 "→ 6/25 수 오후 8:00" 같은 결과 요약
}): Promise<void> {
  const what = input.kind === "cancel" ? "수업 취소" : "일정 변경";
  const verb = input.accepted ? "수락됐어요" : "거절됐어요";
  const body =
    input.accepted && input.detail
      ? `${what} 요청이 수락됐어요. ${input.detail}`
      : `${what} 요청이 ${verb}.`;
  await sb.from("notifications").insert({
    recipient_type: input.recipientType,
    recipient_id: input.recipientId,
    type: "request",
    title: `${what} 요청 ${input.accepted ? "수락" : "거절"}`,
    body,
    channel: "in_app",
    status: "unread",
  });
}

export interface NotificationView { id: string; type: string; title: string; body: string | null; createdAt: string; status: string; }

export async function getNotifications(recipientType: "member" | "trainer", recipientId: string): Promise<NotificationView[]> {
  const { data } = await sb.from("notifications").select("id, type, title, body, created_at, status")
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId).eq("channel", "in_app")
    .order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((n) => ({ id: n.id as string, type: n.type as string, title: n.title as string, body: n.body as string | null, createdAt: n.created_at as string, status: n.status as string }));
}

export async function markNotificationRead(id: string, recipientType: "member" | "trainer", recipientId: string): Promise<void> {
  await sb.from("notifications").update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_type", recipientType).eq("recipient_id", recipientId);
}

export async function countUnread(recipientType: "member" | "trainer", recipientId: string): Promise<number> {
  const { count } = await sb.from("notifications").select("*", { count: "exact", head: true })
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId).eq("status", "unread").eq("channel", "in_app");
  return count ?? 0;
}
