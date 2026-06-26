"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { computeRefund } from "@/lib/data/refund";
import { getMembershipBalance } from "@/lib/data/groups/owner-ops";
import type { Gender, PaymentMethod } from "@/lib/types";

type Result = { ok: boolean; error?: string };

async function requireOwner() {
  const t = await getTrainerContext();
  if (!t) return { t: null, err: "로그인이 필요해요" };
  if (t.role !== "owner") return { t: null, err: OWNER_ONLY_ERROR };
  return { t, err: null };
}

/** start + 일수 → "YYYY-MM-DD" */
function addDays(startISO: string, days: number): string {
  return new Date(new Date(startISO + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** 연장: 만료일 += 상품 duration_days(무료). 잔여>0일 때만. expired면 active 복귀. */
export async function extendMembership(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("end_date, remaining_sessions, product_id").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if ((ms.remaining_sessions ?? 0) <= 0) return { ok: false, error: "잔여 회차가 없어 연장할 수 없어요" };
  const { data: prod } = await sb.from("membership_products").select("duration_days").eq("id", ms.product_id).maybeSingle();
  const days = prod?.duration_days ?? 30;
  const today = todayISO();
  const base = String(ms.end_date) > today ? String(ms.end_date) : today; // 만료됐으면 오늘부터
  await sb.from("memberships").update({ end_date: addDays(base, days), status: "active" }).eq("id", membershipId);
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "extend", amount: days, note: `+${days}일`, created_by: t.id });
  revalidatePath("/t"); revalidatePath(`/t/members`);
  return { ok: true };
}

export async function previewRefund(membershipId: string) {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("total_sessions, remaining_sessions, list_unit_price").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  const bal = await getMembershipBalance(membershipId);
  return { ok: true, ...computeRefund({ paidSum: bal.paid, totalSessions: ms.total_sessions, remainingSessions: ms.remaining_sessions, listUnitPrice: (ms.list_unit_price as number | null) ?? 0 }) };
}

/** 환불: 음수 결제 행 + status refunded + remaining 0 + events. */
export async function refundMembership(input: { membershipId: string; method: PaymentMethod }): Promise<Result & { refund?: number }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const pre = await previewRefund(input.membershipId);
  if (!pre.ok) return { ok: false, error: pre.error };
  // ponytail: cast after guard — tsc can't narrow inferred union without explicit discriminant
  const { refund: preRefund, used: preUsed, penalty: prePenalty } = pre as { ok: true; refund: number; used: number; deduction: number; penalty: number };
  if (preRefund > 0) {
    await sb.from("payments").insert({ membership_id: input.membershipId, method: input.method, amount: -preRefund, paid_at: todayISO(), note: `환불: 사용 ${preUsed}회 정상가 차감 / 위약금 10%`, recorded_by: t.id });
  }
  await sb.from("memberships").update({ status: "refunded", remaining_sessions: 0 }).eq("id", input.membershipId);
  await sb.from("membership_events").insert({ membership_id: input.membershipId, type: "refund", amount: -preRefund, note: `환불 ${preRefund.toLocaleString()}원(사용 ${preUsed}회·위약금 ${prePenalty.toLocaleString()})`, created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/revenue"); revalidatePath("/t/members");
  return { ok: true, refund: preRefund };
}

/** 양도: 회원권 통째 이전(member_id 교체). 대상=기존 회원 또는 신규 즉시 등록(새 결제 없음). */
export async function transferMembership(input: { membershipId: string; toMemberId?: string; newMember?: { name: string; phone: string; birth: string; gender: Gender } }): Promise<Result & { toMemberId?: string }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  let toId = input.toMemberId;
  if (!toId && input.newMember) {
    const n = input.newMember;
    const phone = n.phone.replace(/\D/g, "");
    const birthdate = `${Number(n.birth.slice(0, 2)) > 30 ? "19" : "20"}${n.birth.slice(0, 2)}-${n.birth.slice(2, 4)}-${n.birth.slice(4, 6)}`;
    const { data: m, error } = await sb.from("members").insert({ name: n.name.trim(), phone, birthdate, password_hash: hashPassword(n.birth.replace(/\D/g, "")), gender: n.gender, status: "active", avatar_tone: "sage" }).select("id").single();
    if (error || !m) return { ok: false, error: "양도 대상 등록 실패(연락처 중복?)" };
    await sb.from("member_trainers").insert({ member_id: m.id, trainer_id: t.id });
    toId = m.id;
  }
  if (!toId) return { ok: false, error: "양도 대상을 선택해주세요" };
  const { data: ms } = await sb.from("memberships").select("member_id").eq("id", input.membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  await sb.from("memberships").update({ member_id: toId }).eq("id", input.membershipId);
  await sb.from("membership_events").insert({ membership_id: input.membershipId, type: "transfer", note: `${ms.member_id} → ${toId}`, created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/members");
  return { ok: true, toMemberId: toId };
}
