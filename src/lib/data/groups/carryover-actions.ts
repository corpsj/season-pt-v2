"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, weekdayKo, parseBirth6 } from "@/lib/data/db";
import { hashPassword } from "@/lib/auth/password";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { parseEndDate, type CarrySlot } from "@/lib/import/carryover-parse";
import type { Gender } from "@/lib/types";

type Result = { ok: boolean; error?: string };

const normPhone = (p: string) => p.replace(/\D/g, "");

export type BulkMemberInput = {
  name: string;
  phone: string;
  birth: string; // YYMMDD
  gender: Gender;
  productId: string | null; // null → 회원만 등록(회원권 없음)
  remaining: number | null; // null → 상품 회차 그대로
  startDate: string | null; // YYYY-MM-DD(등록일). null → 오늘. 만료 = 등록일 + 상품 유효기간
  slots: CarrySlot[];
  trainerId: string | null; // null → 대표 본인
};

/**
 * 한꺼번에 입력(콘솔 직접 입력 일괄 등록): 회원 + 담당강사 + 정기 스케줄 + (선택) 회원권.
 * 회원권 만료일은 등록일 + 상품 유효기간으로 계산. 결제행은 만들지 않음(매출 중립) —
 * 기존 회원 이관·신규 명단 온보딩 겸용이라 매출은 결제 화면에서 별도 기록한다.
 */
export async function bulkAddMembers(
  rows: BulkMemberInput[],
): Promise<Result & { created: number; failed: { name: string; error: string }[] }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요", created: 0, failed: [] };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR, created: 0, failed: [] };
  if (rows.length === 0) return { ok: false, error: "등록할 회원이 없어요", created: 0, failed: [] };

  // 상품·강사 사전 로드(id → 매핑). 드롭다운 입력이지만 서버에서 재검증(위조/stale 방지).
  const [{ data: products }, { data: trainers }] = await Promise.all([
    sb.from("membership_products").select("id, sessions, unit_list_price, duration_days"),
    sb.from("trainers").select("id").neq("status", "inactive"),
  ]);
  const prodById = new Map((products ?? []).map((p) => [p.id as string, p]));
  const trainerIds = new Set((trainers ?? []).map((tr) => tr.id as string));

  const failed: { name: string; error: string }[] = [];
  let created = 0;

  for (const r of rows) {
    const name = r.name.trim();
    const phone = normPhone(r.phone);
    const birthdate = parseBirth6(r.birth); // 실존 날짜 검증(감사 #29)

    if (!name || !phone || !birthdate) {
      failed.push({ name: name || r.phone, error: "이름·연락처·생년월일 확인" });
      continue;
    }

    // 담당강사: id를 줬는데 비활성/미존재면 조용히 대표 배정하지 않고 거부(오배정 방지).
    let trainerId = t.id;
    if (r.trainerId) {
      if (!trainerIds.has(r.trainerId)) {
        failed.push({ name, error: "담당강사를 확인해주세요" });
        continue;
      }
      trainerId = r.trainerId;
    }

    // 회원권 입력 검증(상품 선택 시에만). 만료일 = 등록일 + 상품 유효기간.
    let membership: { productId: string; sessions: number; unitListPrice: number; remaining: number; start: string; end: string } | null = null;
    if (r.productId) {
      const prod = prodById.get(r.productId);
      if (!prod) {
        failed.push({ name, error: "상품을 찾을 수 없어요" });
        continue;
      }
      const remaining = r.remaining ?? prod.sessions;
      if (!Number.isInteger(remaining) || remaining < 0 || remaining > prod.sessions) {
        failed.push({ name, error: `잔여횟수는 0~${prod.sessions} 범위여야 해요` });
        continue;
      }
      const start = parseEndDate(r.startDate ?? todayISO());
      if (!start) {
        failed.push({ name, error: "등록일이 올바르지 않아요" });
        continue;
      }
      const end = new Date(new Date(start + "T00:00:00Z").getTime() + prod.duration_days * 86400000)
        .toISOString()
        .slice(0, 10);
      membership = { productId: prod.id, sessions: prod.sessions, unitListPrice: prod.unit_list_price, remaining, start, end };
    }

    // 더블부킹 가드(감사 #11·H6): 같은 강사의 같은 요일·시각 활성 정기수업이 있으면 이 행 거부.
    // 같은 배치 내 중복도 앞 행이 먼저 insert되므로 여기서 걸린다. 회원 생성 前에 걸러 고아 방지.
    let clashMsg: string | null = null;
    for (const s of r.slots) {
      const { data: clash } = await sb
        .from("schedules")
        .select("id")
        .eq("trainer_id", trainerId)
        .eq("active", true)
        .eq("weekday", s.weekday)
        .eq("hour", s.hour)
        .eq("minute", s.minute)
        .limit(1)
        .maybeSingle();
      if (clash) {
        clashMsg = `${weekdayKo(s.weekday)} ${s.hour}시${s.minute ? " " + s.minute + "분" : ""}에 이미 다른 수업이 있어요`;
        break;
      }
    }
    if (clashMsg) {
      failed.push({ name, error: clashMsg });
      continue;
    }

    // 1) 회원
    const { data: member, error: memErr } = await sb
      .from("members")
      .insert({ name, phone, birthdate, password_hash: hashPassword(r.birth.replace(/\D/g, "")), gender: r.gender, status: "active", avatar_tone: "sage" })
      .select("id")
      .single();
    if (memErr || !member) {
      failed.push({ name, error: "이미 등록된 연락처이거나 등록 실패" });
      continue;
    }

    // 2) 담당 강사 — 연결 실패는 치명적(어느 강사에게도 안 보임): 회원 롤백 후 실패 처리(감사 #20).
    const { error: linkErr } = await sb.from("member_trainers").insert({ member_id: member.id, trainer_id: trainerId });
    if (linkErr) {
      await sb.from("members").delete().eq("id", member.id);
      failed.push({ name, error: "담당 강사 연결 실패 — 다시 시도해주세요" });
      continue;
    }

    // 3) 정기 스케줄
    for (const s of r.slots) {
      const { data: sched } = await sb
        .from("schedules")
        .insert({ trainer_id: trainerId, type: "1on1", weekday: s.weekday, hour: s.hour, minute: s.minute, active: true })
        .select("id")
        .single();
      if (sched) await sb.from("schedule_members").insert({ schedule_id: sched.id, member_id: member.id });
    }

    // 4) 회원권(선택): 잔여·등록일 그대로, 상품 연결, 결제 미기록 → 매출 중립
    if (membership) {
      const { error: msErr } = await sb.from("memberships").insert({
        member_id: member.id,
        product: String(membership.sessions),
        product_id: membership.productId,
        total_sessions: membership.sessions,
        remaining_sessions: membership.remaining,
        start_date: membership.start,
        end_date: membership.end,
        price: null,
        list_unit_price: membership.unitListPrice,
        status: "active",
        guided: false,
      });
      if (msErr) {
        failed.push({ name, error: "회원은 등록됐지만 회원권 발급 실패 — 회원 상세에서 발급하세요" });
        continue;
      }
    }
    created++;
  }

  revalidatePath("/console/members");
  revalidatePath("/t/members");
  return { ok: created > 0, created, failed };
}
