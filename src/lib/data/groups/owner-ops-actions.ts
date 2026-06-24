"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO } from "@/lib/data/db";
import { hashPassword } from "@/lib/auth/password";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import type { Gender, PaymentMethod } from "@/lib/types";

type Result = { ok: boolean; error?: string };

const normPhone = (p: string) => p.replace(/\D/g, "");

/** YYMMDD → YYYY-MM-DD (YY>30 → 19YY, 아니면 20YY). */
function parseBirth(yymmdd: string): string | null {
  const d = yymmdd.replace(/\D/g, "");
  if (d.length !== 6) return null;
  const yy = Number(d.slice(0, 2));
  const mm = d.slice(2, 4);
  const dd = d.slice(4, 6);
  const century = yy > 30 ? "19" : "20";
  return `${century}${d.slice(0, 2)}-${mm}-${dd}`;
}

const PRODUCT_PRICE: Record<string, number> = {
  "10": 750000,
  "20": 1400000,
  "30": 1980000,
};

/** 신규 회원 등록 + 담당(대표) 연결 + 정기 수업 스케줄 생성. */
export async function createMember(input: {
  name: string;
  phone: string;
  birth: string; // YYMMDD
  gender: Gender;
  weekdays: number[];
  hour: number;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const name = input.name.trim();
  const phone = normPhone(input.phone);
  const birthdate = parseBirth(input.birth);
  if (!name) return { ok: false, error: "이름을 입력해주세요" };
  if (!phone) return { ok: false, error: "연락처를 입력해주세요" };
  if (!birthdate) return { ok: false, error: "생년월일을 6자리(YYMMDD)로 입력해주세요" };

  const password_hash = hashPassword(input.birth.replace(/\D/g, ""));

  const { data: member, error: memErr } = await sb
    .from("members")
    .insert({
      name,
      phone,
      birthdate,
      password_hash,
      gender: input.gender,
      status: "active",
      avatar_tone: "sage",
    })
    .select("id")
    .single();
  if (memErr || !member) {
    return { ok: false, error: "이미 등록된 연락처이거나 등록에 실패했어요" };
  }

  await sb.from("member_trainers").insert({ member_id: member.id, trainer_id: t.id });

  // 선택 요일마다 정기 수업 스케줄 + 참여 회원 연결.
  for (const wd of input.weekdays) {
    const { data: sched } = await sb
      .from("schedules")
      .insert({ trainer_id: t.id, type: "1on1", weekday: wd, hour: input.hour, active: true })
      .select("id")
      .single();
    if (sched) {
      await sb.from("schedule_members").insert({ schedule_id: sched.id, member_id: member.id });
    }
  }

  revalidatePath("/t");
  revalidatePath("/t/members");
  return { ok: true };
}

/** 회원권 발급: memberships insert (총/잔여 = 상품, 시작 오늘, 종료 +90일, 가격). */
export async function issueMembership(
  memberId: string,
  product: "10" | "20" | "30"
): Promise<Result & { membershipId?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const total = Number(product);
  const start = todayISO();
  const end = new Date(new Date(start + "T00:00:00Z").getTime() + 90 * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data: ms, error } = await sb
    .from("memberships")
    .insert({
      member_id: memberId,
      product,
      total_sessions: total,
      remaining_sessions: total,
      start_date: start,
      end_date: end,
      price: PRODUCT_PRICE[product] ?? null,
      status: "active",
      guided: false,
    })
    .select("id")
    .single();
  if (error || !ms) return { ok: false, error: "회원권 발급에 실패했어요" };

  revalidatePath(`/t/members/${memberId}`);
  revalidatePath("/t");
  return { ok: true, membershipId: ms.id };
}

/** 결제 기록: 회원의 최신 활성 회원권에 payment insert. */
export async function recordPayment(input: {
  memberId?: string;
  membershipId?: string;
  method: PaymentMethod;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  let membershipId = input.membershipId;
  let amount: number | null = null;

  if (!membershipId && input.memberId) {
    const { data: ms } = await sb
      .from("memberships")
      .select("id, price")
      .eq("member_id", input.memberId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    membershipId = ms?.id;
    amount = ms?.price ?? null;
  } else if (membershipId) {
    const { data: ms } = await sb
      .from("memberships")
      .select("price")
      .eq("id", membershipId)
      .maybeSingle();
    amount = ms?.price ?? null;
  }

  if (!membershipId) return { ok: false, error: "결제할 회원권을 찾지 못했어요" };

  const { error } = await sb.from("payments").insert({
    membership_id: membershipId,
    method: input.method,
    amount,
    paid_at: todayISO(),
    recorded_by: t.id,
  });
  if (error) return { ok: false, error: "결제 기록에 실패했어요" };

  revalidatePath("/t");
  return { ok: true };
}

/** 매출 직접 추가(과거/기타 수입). membership_id 없는 payments 행. 대표 전용. */
export async function addRevenue(input: {
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  note?: string;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  if (!input.amount || input.amount <= 0) return { ok: false, error: "금액을 입력해주세요" };
  const { error } = await sb.from("payments").insert({
    membership_id: null,
    method: input.method,
    amount: Math.round(input.amount),
    paid_at: input.paidAt || todayISO(),
    note: input.note?.trim() || null,
    recorded_by: t.id,
  });
  if (error) return { ok: false, error: "매출 추가에 실패했어요" };
  revalidatePath("/t/revenue");
  revalidatePath("/t/perf");
  return { ok: true };
}
