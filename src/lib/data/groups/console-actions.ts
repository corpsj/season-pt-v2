"use server";
import { sb, getTrainerContext } from "@/lib/data/db";
import { ensureOwner } from "@/lib/auth/guard";
import { markNotificationRead } from "@/lib/data/groups/notifications";
import { getProposeSlots } from "@/lib/data/groups/scheduling";
import { getStudioCalendarWeek, type StudioCalendarWeek } from "@/lib/data/groups/console";
import { getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getChatRoom } from "@/lib/data/groups/chat";
import { issueMembership, recordPayment } from "@/lib/data/groups/owner-ops-actions";
import { getMemberSchedule, getTeamCandidates, getMemberRenewableProducts, type MemberScheduleView } from "@/lib/data/groups/owner-ops";
import type { ChatRoomView, MemberDetailView, MembershipProduct, PaymentMethod } from "@/lib/types";

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

/** 이 회원이 쓰던 단종 상품(연장 전용) — 발급 모달이 열릴 때 픽커에 합쳐 보여준다. */
export async function loadMemberRenewableProducts(memberId: string): Promise<MembershipProduct[]> {
  if (!(await ensureOwner())) return [];
  return getMemberRenewableProducts(memberId);
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
    if (issued.renewed && issued.prev) {
      // 연장(재구매)이었으면 기존 회원권을 삭제하면 안 된다(치명적 데이터 손실) — 연장분만 원복.
      await sb.from("memberships").update({
        remaining_sessions: issued.prev.remaining_sessions,
        total_sessions: issued.prev.total_sessions,
        end_date: issued.prev.end_date,
        price: issued.prev.price,
        product: issued.prev.product,
      }).eq("id", issued.membershipId);
      // 방금 남긴 재구매 연장 이벤트만 제거(다른 이력 보존).
      const { data: ev } = await sb.from("membership_events").select("id")
        .eq("membership_id", issued.membershipId).eq("type", "extend").like("note", "재구매 %")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ev) await sb.from("membership_events").delete().eq("id", ev.id);
    } else {
      // 신규 발급이면: 결제 없는 회원권이 남으면 재시도 시 중복 발급된다(감사 #18) — 방금 발급분을 회수.
      await sb.from("membership_events").delete().eq("membership_id", issued.membershipId);
      await sb.from("memberships").delete().eq("id", issued.membershipId);
    }
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

/* ---------------------------------- 전역 검색 (C2) ---------------------------------- */

export type SearchHit = {
  group: "member" | "trainer" | "request" | "message";
  id: string;
  title: string;
  sub?: string;
  href: string;
};

/** Postgres LIKE/ILIKE 특수문자(%, _)와 escape 문자(\)를 이스케이프 — 사용자 입력이 와일드카드로 오작동/과매칭하지 않게. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 매칭 회원의 세션에 걸린 pending 회원 요청. */
async function searchRequestHits(
  memberIds: string[],
  nameById: Map<string, string>,
): Promise<SearchHit[]> {
  if (memberIds.length === 0) return [];
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id, member_id")
    .in("member_id", memberIds);
  const smRows = (sm ?? []) as { session_id: string; member_id: string }[];
  if (smRows.length === 0) return [];
  const memberBySession = new Map<string, string>();
  const sessionIds: string[] = [];
  for (const r of smRows) {
    if (!memberBySession.has(r.session_id)) {
      memberBySession.set(r.session_id, r.member_id);
      sessionIds.push(r.session_id);
    }
  }
  const { data: reqs } = await sb
    .from("schedule_change_requests")
    .select("id, session_id, type")
    .in("session_id", sessionIds)
    .eq("requester_type", "member")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  return ((reqs ?? []) as { id: string; session_id: string; type: string }[]).map((r) => {
    const name = nameById.get(memberBySession.get(r.session_id) ?? "") ?? "";
    return {
      group: "request",
      id: r.id,
      title: `${name} · ${r.type === "cancel" ? "취소 요청" : "변경 요청"}`,
      sub: "처리 대기",
      href: "/console/requests",
    };
  });
}

/** 매칭 회원이 참여한 채팅 스레드. */
async function searchMessageHits(
  memberIds: string[],
  nameById: Map<string, string>,
): Promise<SearchHit[]> {
  if (memberIds.length === 0) return [];
  const { data: parts } = await sb
    .from("chat_participants")
    .select("thread_id, member_id")
    .in("member_id", memberIds);
  const partRows = (parts ?? []) as { thread_id: string; member_id: string }[];
  if (partRows.length === 0) return [];
  const memberByThread = new Map<string, string>();
  const threadIds: string[] = [];
  for (const p of partRows) {
    if (!memberByThread.has(p.thread_id)) {
      memberByThread.set(p.thread_id, p.member_id);
      threadIds.push(p.thread_id);
    }
  }
  const { data: threads } = await sb
    .from("chat_threads")
    .select("id, last_message, last_at")
    .in("id", threadIds)
    .order("last_at", { ascending: false, nullsFirst: false })
    .limit(5);
  return ((threads ?? []) as { id: string; last_message: string | null }[]).map((th) => ({
    group: "message",
    id: th.id,
    title: nameById.get(memberByThread.get(th.id) ?? "") ?? "",
    sub: th.last_message ?? "대화 열기",
    href: `/console/messages?t=${th.id}`,
  }));
}

/**
 * 콘솔 전역 검색(대표만) — 회원·강사·요청·메시지를 각 최대 5건씩. q 2자 미만이면 빈 결과.
 * 이름/전화는 or() 필터의 콤마·괄호 파싱 표면을 피해 별도 ilike 쿼리로 분리하고, 입력은 escapeLike로 정제한다.
 */
export async function searchAll(q: string): Promise<SearchHit[]> {
  if (!(await ensureOwner())) return [];
  const term = q.trim();
  if (term.length < 2) return [];
  const pat = `%${escapeLike(term)}%`;

  const [byName, byPhone, trainerRows] = await Promise.all([
    sb.from("members").select("id, name, phone").ilike("name", pat).limit(5),
    sb.from("members").select("id, name, phone").ilike("phone", pat).limit(5),
    sb.from("trainers").select("id, display_name, role").eq("bootstrap_admin", false).ilike("display_name", pat).limit(5),
  ]);

  const memberMap = new Map<string, { id: string; name: string; phone: string | null }>();
  for (const r of [...(byName.data ?? []), ...(byPhone.data ?? [])] as {
    id: string;
    name: string;
    phone: string | null;
  }[]) {
    if (!memberMap.has(r.id)) memberMap.set(r.id, { id: r.id, name: r.name, phone: r.phone });
  }
  const memberIds = [...memberMap.keys()];
  const nameById = new Map([...memberMap.values()].map((m) => [m.id, m.name] as const));

  const [reqHits, msgHits] = await Promise.all([
    searchRequestHits(memberIds, nameById),
    searchMessageHits(memberIds, nameById),
  ]);

  const hits: SearchHit[] = [];
  for (const m of [...memberMap.values()].slice(0, 5)) {
    hits.push({ group: "member", id: m.id, title: m.name, sub: m.phone ?? undefined, href: `/console/members?sel=${m.id}` });
  }
  for (const t of (trainerRows.data ?? []) as { id: string; display_name: string; role: string }[]) {
    hits.push({ group: "trainer", id: t.id, title: t.display_name, sub: t.role === "owner" ? "대표" : "강사", href: `/console/trainers?sel=${t.id}` });
  }
  hits.push(...reqHits, ...msgHits);
  return hits;
}
