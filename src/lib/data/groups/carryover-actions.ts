"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, weekdayKo, parseBirth6 } from "@/lib/data/db";
import { hashPassword } from "@/lib/auth/password";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { parseEndDate, type CarrySlot, type Gender } from "@/lib/import/carryover-parse";

type Result = { ok: boolean; error?: string };

const normPhone = (p: string) => p.replace(/\D/g, "");

export type CarryInput = {
  name: string;
  phone: string;
  birth: string;
  gender: Gender;
  productName: string;
  remaining: number;
  endDate: string; // YYYY-MM-DD
  slots: CarrySlot[];
  trainerName: string | null;
};

/**
 * 기존 회원권 이관: 회원 + (잔여·만료 그대로) 회원권 + 정기 스케줄 생성. 결제행은 만들지 않음(매출 중립).
 * 상품명은 사전 등록된 membership_products.name과 일치해야 하며 그 상품에 연결된다(연장·환불 정상 동작).
 */
export async function carryoverMembers(
  rows: CarryInput[],
): Promise<Result & { created: number; failed: { name: string; error: string }[] }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요", created: 0, failed: [] };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR, created: 0, failed: [] };
  if (rows.length === 0) return { ok: false, error: "이관할 회원이 없어요", created: 0, failed: [] };

  // 상품·강사 사전 로드(이름 → 매핑).
  const [{ data: products }, { data: trainers }] = await Promise.all([
    sb.from("membership_products").select("id, name, sessions, unit_list_price"),
    sb.from("trainers").select("id, display_name").neq("status", "inactive"),
  ]);
  const prodByName = new Map((products ?? []).map((p) => [p.name.trim(), p]));
  const trainerByName = new Map((trainers ?? []).map((tr) => [tr.display_name.trim(), tr.id as string]));

  const failed: { name: string; error: string }[] = [];
  let created = 0;
  const start = todayISO();

  for (const r of rows) {
    const name = r.name.trim();
    const phone = normPhone(r.phone);
    const birthdate = parseBirth6(r.birth); // 실존 날짜 검증(감사 #29)
    const prod = prodByName.get(r.productName.trim());

    if (!name || !phone || !birthdate) {
      failed.push({ name: name || r.phone, error: "이름·연락처·생년월일 확인" });
      continue;
    }
    if (!prod) {
      failed.push({ name, error: `상품 '${r.productName}' 없음 — 상품을 먼저 등록하세요` });
      continue;
    }
    if (!Number.isFinite(r.remaining) || r.remaining < 0 || r.remaining > prod.sessions) {
      failed.push({ name, error: `잔여횟수는 0~${prod.sessions} 범위여야 해요` });
      continue;
    }
    // 만료일 서버 재검증(존재하지 않는 날짜 등) — 회원 생성 前에 걸러 고아 방지.
    const endDate = parseEndDate(r.endDate);
    if (!endDate) {
      failed.push({ name, error: "만료일이 올바르지 않아요" });
      continue;
    }
    // 담당강사: 이름을 줬는데 매칭 안 되면 조용히 대표 배정하지 않고 거부(오배정 방지).
    let trainerId = t.id;
    if (r.trainerName) {
      const found = trainerByName.get(r.trainerName.trim());
      if (!found) {
        failed.push({ name, error: `강사 '${r.trainerName}' 미매칭 — 이름을 확인하세요` });
        continue;
      }
      trainerId = found;
    }

    // 더블부킹 가드(감사 #11): 같은 강사의 같은 요일·시각 활성 정기수업이 이미 있으면 이 행 거부 —
    // 신규 등록(createMember H6)과 동일 규칙. 회원 생성 前에 걸러 고아 방지.
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

    // 2) 담당 강사
    await sb.from("member_trainers").insert({ member_id: member.id, trainer_id: trainerId });

    // 3) 정기 스케줄
    for (const s of r.slots) {
      const { data: sched } = await sb
        .from("schedules")
        .insert({ trainer_id: trainerId, type: "1on1", weekday: s.weekday, hour: s.hour, minute: s.minute, active: true })
        .select("id")
        .single();
      if (sched) await sb.from("schedule_members").insert({ schedule_id: sched.id, member_id: member.id });
    }

    // 4) 회원권(잔여·만료 그대로, 상품 연결, 결제 미기록 → 매출 중립)
    const { error: msErr } = await sb.from("memberships").insert({
      member_id: member.id,
      product: String(prod.sessions),
      product_id: prod.id,
      total_sessions: prod.sessions,
      remaining_sessions: r.remaining,
      start_date: start,
      end_date: endDate,
      price: null,
      list_unit_price: prod.unit_list_price,
      status: "active",
      guided: false,
    });
    if (msErr) {
      failed.push({ name, error: "회원은 등록됐지만 회원권 이관 실패 — 회원 상세에서 발급하세요" });
      continue;
    }
    created++;
  }

  revalidatePath("/console/members");
  revalidatePath("/t/members");
  return { ok: created > 0, created, failed };
}
