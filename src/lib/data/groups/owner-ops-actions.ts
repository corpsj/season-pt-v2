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

/** 신규 회원 등록 + 담당 트레이너 연결 + 정기 수업 스케줄 생성. 옵션으로 회원권 발급·결제 기록. */
export async function createMember(input: {
  name: string;
  phone: string;
  birth: string; // YYMMDD
  gender: Gender;
  slots: { weekday: number; hour: number; minute: number }[];
  trainerId?: string;
  product?: { productId: string };
  payment?: { method: PaymentMethod; amount?: number; paidAt?: string };
}): Promise<Result & { memberId?: string; warn?: string }> {
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

  const assignedTrainerId = input.trainerId ?? t.id;
  await sb.from("member_trainers").insert({ member_id: member.id, trainer_id: assignedTrainerId });

  // 선택 요일마다 정기 수업 스케줄 + 참여 회원 연결.
  for (const s of input.slots) {
    const { data: sched } = await sb
      .from("schedules")
      .insert({ trainer_id: assignedTrainerId, type: "1on1", weekday: s.weekday, hour: s.hour, minute: s.minute, active: true })
      .select("id")
      .single();
    if (sched) {
      await sb.from("schedule_members").insert({ schedule_id: sched.id, member_id: member.id });
    }
  }

  // 회원권 발급 (옵션) — 하위 단계 실패는 회원 등록을 되돌리진 않되, 대표에게 경고로 노출(매출 누락 방지)
  let warn: string | undefined;
  if (input.product?.productId) {
    const issued = await issueMembership(member.id, input.product.productId);
    if (!issued.ok) {
      warn = "회원은 등록됐지만 회원권 발급에 실패했어요. 회원 상세에서 다시 발급해주세요.";
    } else if (issued.membershipId && input.payment) {
      const paid = await recordPayment({
        membershipId: issued.membershipId,
        method: input.payment.method,
        amount: input.payment.amount,
        paidAt: input.payment.paidAt,
      });
      if (!paid.ok) warn = "회원·회원권은 등록됐지만 결제 기록에 실패했어요. 결제 화면에서 다시 기록해주세요.";
    }
  }

  revalidatePath("/t");
  revalidatePath("/t/members");
  return { ok: true, memberId: member.id, warn };
}

/** 회원권 발급: membership_products에서 상품 조회, memberships insert. */
export async function issueMembership(
  memberId: string,
  productId: string,
): Promise<Result & { membershipId?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { data: prod } = await sb
    .from("membership_products")
    .select("id, sessions, price, unit_list_price, duration_days, name")
    .eq("id", productId)
    .maybeSingle();
  if (!prod) return { ok: false, error: "상품을 찾을 수 없어요" };

  const start = todayISO();
  const end = new Date(new Date(start + "T00:00:00Z").getTime() + prod.duration_days * 86400000)
    .toISOString()
    .slice(0, 10);

  // ponytail: product column stores display label (legacy compat for getRevenue label)
  const { data: ms, error } = await sb
    .from("memberships")
    .insert({
      member_id: memberId,
      product: String(prod.sessions),
      product_id: prod.id,
      total_sessions: prod.sessions,
      remaining_sessions: prod.sessions,
      start_date: start,
      end_date: end,
      price: prod.price,
      // 정상가 미설정(0) 시 단가로 폴백 — 0이 스냅샷되면 환불식 used×0=0이 되어 과지급됨
      list_unit_price: prod.unit_list_price || (prod.sessions > 0 ? Math.round(prod.price / prod.sessions) : 0),
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

/** 결제 기록: 회원의 최신 활성 회원권에 payment insert. amount/paidAt 미지정 시 상품가/오늘 사용. */
export async function recordPayment(input: {
  memberId?: string;
  membershipId?: string;
  method: PaymentMethod;
  amount?: number;
  paidAt?: string;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  let membershipId = input.membershipId;
  let amount: number | null = input.amount ?? null;

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
    if (amount === null) amount = ms?.price ?? null;
  } else if (membershipId && amount === null) {
    const { data: ms } = await sb
      .from("memberships")
      .select("price")
      .eq("id", membershipId)
      .maybeSingle();
    amount = ms?.price ?? null;
  }

  if (!membershipId) return { ok: false, error: "결제할 회원권을 찾지 못했어요" };

  const paidAt = input.paidAt ?? todayISO();
  // 더블클릭/재시도 방어: 직전 20초 내 동일 (회원권·금액·일자) 결제가 있으면 멱등 처리.
  // 정당한 반복 결제(분 단위 간격)는 막지 않도록 창을 짧게.
  if (amount !== null) {
    const since = new Date(Date.now() - 20000).toISOString();
    const { data: dup } = await sb.from("payments").select("id")
      .eq("membership_id", membershipId).eq("amount", amount).eq("paid_at", paidAt)
      .gte("created_at", since).limit(1).maybeSingle();
    if (dup) return { ok: true };
  }

  const { error } = await sb.from("payments").insert({
    membership_id: membershipId,
    method: input.method,
    amount,
    paid_at: paidAt,
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

/* ----------------------- product catalog actions ----------------------- */

export async function createProduct(input: {
  name: string;
  sessions: number;
  price: number;
  unitListPrice: number;
  durationDays: number;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const unitListPrice = input.unitListPrice || (input.sessions > 0 ? Math.round(input.price / input.sessions) : 0);
  const { error } = await sb.from("membership_products").insert({
    name: input.name.trim(),
    sessions: input.sessions,
    price: input.price,
    unit_list_price: unitListPrice,
    duration_days: input.durationDays,
  });
  if (error) return { ok: false, error: "상품 추가에 실패했어요" };
  revalidatePath("/t/settings/products");
  return { ok: true };
}

export async function updateProduct(
  id: string,
  input: { name: string; sessions: number; price: number; unitListPrice: number; durationDays: number },
): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const unitListPrice = input.unitListPrice || (input.sessions > 0 ? Math.round(input.price / input.sessions) : 0);
  const { error } = await sb
    .from("membership_products")
    .update({ name: input.name.trim(), sessions: input.sessions, price: input.price, unit_list_price: unitListPrice, duration_days: input.durationDays })
    .eq("id", id);
  if (error) return { ok: false, error: "상품 수정에 실패했어요" };
  revalidatePath("/t/settings/products");
  return { ok: true };
}

export async function setProductActive(id: string, active: boolean): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("membership_products").update({ active }).eq("id", id);
  if (error) return { ok: false, error: "상태 변경에 실패했어요" };
  revalidatePath("/t/settings/products");
  return { ok: true };
}

/* ----------------------- policy / notifications actions ----------------------- */

export async function updatePolicy(input: {
  noshowDeducts: boolean;
  cancelCutoffHours: number;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb
    .from("studio_settings")
    .upsert({ id: 1, noshow_deducts: input.noshowDeducts, cancel_cutoff_hours: input.cancelCutoffHours, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "정책 저장에 실패했어요" };
  revalidatePath("/t/settings/policy");
  return { ok: true };
}

export async function updateNotifications(input: {
  notifExpiry: boolean;
  notifSession: boolean;
  notifPayment: boolean;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb
    .from("studio_settings")
    .upsert({ id: 1, notif_expiry: input.notifExpiry, notif_session: input.notifSession, notif_payment: input.notifPayment, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "알림 설정 저장에 실패했어요" };
  revalidatePath("/t/settings/notifications");
  return { ok: true };
}

/* ----------------------- exercise catalog actions ----------------------- */

export async function createExercise(name: string, category?: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("exercises").insert({ name: name.trim(), category: category?.trim() || null });
  if (error) return { ok: false, error: "종목 추가에 실패했어요" };
  revalidatePath("/t/settings/exercises");
  return { ok: true };
}

export async function renameExercise(id: string, name: string, category?: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("exercises").update({ name: name.trim(), category: category?.trim() || null }).eq("id", id);
  if (error) return { ok: false, error: "종목 이름 변경에 실패했어요" };
  revalidatePath("/t/settings/exercises");
  return { ok: true };
}

export async function setExerciseActive(id: string, active: boolean): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("exercises").update({ active }).eq("id", id);
  if (error) return { ok: false, error: "상태 변경에 실패했어요" };
  revalidatePath("/t/settings/exercises");
  return { ok: true };
}
