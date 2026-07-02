"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, kstDateISO, dayDiff, parseBirth6 } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { computeRefund } from "@/lib/data/refund";
import { getMembershipBalance } from "@/lib/data/groups/owner-ops";
import { deactivateSoloSchedules } from "@/lib/data/groups/session-mutations";
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
    .select("end_date, remaining_sessions, product_id, status").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if ((ms.remaining_sessions ?? 0) <= 0) return { ok: false, error: "잔여 회차가 없어 연장할 수 없어요" };
  const { data: prod } = await sb.from("membership_products").select("duration_days").eq("id", ms.product_id).maybeSingle();
  if (!prod) return { ok: false, error: "상품 정보를 찾을 수 없어요" };
  const days = prod.duration_days;
  const today = todayISO();
  const base = String(ms.end_date) > today ? String(ms.end_date) : today; // 만료됐으면 오늘부터
  // 일시정지 중 연장은 정지 상태 유지 — 연장이 정지를 조용히 풀고 paused_at만 남기던 문제(감사 #8).
  const nextStatus = ms.status === "paused" ? "paused" : "active";
  const { error: upErr } = await sb.from("memberships")
    .update({ end_date: addDays(base, days), status: nextStatus }).eq("id", membershipId);
  if (upErr) return { ok: false, error: "연장에 실패했어요. 다시 시도해주세요." }; // 감사 #22
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "extend", amount: days, note: `+${days}일`, created_by: t.id });
  revalidatePath("/t"); revalidatePath(`/t/members`);
  return { ok: true };
}

/** 일시정지: 활성 회원권을 동결(차감·만료 중단). 재개 시 정지기간만큼 만료일 연장하려 paused_at 기록. */
export async function pauseMembership(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships").select("status").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if (ms.status !== "active") return { ok: false, error: "활성 회원권만 정지할 수 있어요" };
  // 원자적 전이(중복 정지 방지)
  const { data: claimed } = await sb.from("memberships")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", membershipId).eq("status", "active").select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "이미 정지된 회원권이에요" };
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "pause", note: "일시정지", created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/members"); revalidatePath(`/t/members`);
  return { ok: true };
}

/** 재개: 정지 기간(일)만큼 만료일 연장 후 활성 복귀. */
export async function resumeMembership(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships").select("status, paused_at, end_date").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if (ms.status !== "paused") return { ok: false, error: "정지된 회원권만 재개할 수 있어요" };
  const pausedDays = ms.paused_at ? Math.max(0, dayDiff(kstDateISO(ms.paused_at as string), todayISO())) : 0;
  const newEnd = addDays(String(ms.end_date), pausedDays);
  const { data: claimed } = await sb.from("memberships")
    .update({ status: "active", paused_at: null, end_date: newEnd })
    .eq("id", membershipId).eq("status", "paused").select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "이미 재개된 회원권이에요" };
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "resume", amount: pausedDays, note: `재개 (+${pausedDays}일 연장)`, created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/members");
  return { ok: true };
}

export async function previewRefund(membershipId: string) {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("total_sessions, remaining_sessions, list_unit_price, status").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  const bal = await getMembershipBalance(membershipId);
  return {
    ok: true, status: ms.status, noBaseline: bal.paid <= 0,
    ...computeRefund({ paidSum: bal.paid, totalSessions: ms.total_sessions, remainingSessions: ms.remaining_sessions, listUnitPrice: (ms.list_unit_price as number | null) ?? 0 }),
  };
}

/** 환불: 음수 결제 행 + status refunded + remaining 0 + events. amountOverride로 협의 금액 지정 가능(감사3 #6·#7). */
export async function refundMembership(input: { membershipId: string; method: PaymentMethod; amountOverride?: number; note?: string }): Promise<Result & { refund?: number }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const pre = await previewRefund(input.membershipId);
  if (!pre.ok) return { ok: false, error: pre.error };
  // ponytail: cast after guard — tsc can't narrow inferred union without explicit discriminant
  const { status: preStatus, refund: preRefund, used: preUsed, penalty: prePenalty, noBaseline } =
    pre as { ok: true; status: string; refund: number; used: number; deduction: number; penalty: number; noBaseline: boolean };
  if (preStatus === "refunded") return { ok: false, error: "이미 환불된 회원권이에요" };
  if (input.amountOverride != null && (!Number.isInteger(input.amountOverride) || input.amountOverride < 0))
    return { ok: false, error: "환불 금액을 0 이상 정수로 입력해주세요" };
  // 이관 회원권(기납부 0)은 자동 산식이 0원 확정으로 이어지므로, 협의 금액 직접 입력을 요구.
  if (noBaseline && input.amountOverride == null)
    return { ok: false, error: "결제 기록이 없는 회원권이에요. 환불 금액을 직접 입력해주세요." };
  const refundAmt = input.amountOverride ?? preRefund;
  // 실패 시 원복용 스냅샷(감사 #3: 음수 결제행 insert 실패가 영구 누락으로 남던 문제) + 이벤트 meta 스냅샷 겸용.
  const { data: msPre } = await sb.from("memberships")
    .select("status, remaining_sessions, end_date, member_id").eq("id", input.membershipId).maybeSingle();
  // Atomic claim: flip to refunded only if not already. The DB enforces a single transition,
  // so a double-click / concurrent refund can't insert two negative-payment rows (double payout).
  const { data: claimed } = await sb.from("memberships")
    .update({ status: "refunded", remaining_sessions: 0 })
    .eq("id", input.membershipId)
    .neq("status", "refunded")
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "이미 환불된 회원권이에요" };
  if (refundAmt > 0) {
    const { error: payErr } = await sb.from("payments").insert({
      membership_id: input.membershipId, method: input.method, amount: -refundAmt, paid_at: todayISO(),
      note: input.note?.trim() || `환불: 사용 ${preUsed}회 정상가 차감 / 위약금 10%`,
      payer_member_id: msPre?.member_id ?? null, recorded_by: t.id,
    });
    if (payErr) {
      // 보상: 환불 표시를 원복해 재시도 가능하게 — 표시만 남고 장부에 환불이 빠지는 반쪽 상태 방지.
      await sb.from("memberships")
        .update({ status: msPre?.status ?? "active", remaining_sessions: msPre?.remaining_sessions ?? 0 })
        .eq("id", input.membershipId);
      return { ok: false, error: "환불 기록 저장에 실패했어요. 다시 시도해주세요." };
    }
  }
  const { error: evErr } = await sb.from("membership_events").insert({
    membership_id: input.membershipId, type: "refund", amount: -refundAmt,
    note: `환불 ${refundAmt.toLocaleString()}원(사용 ${preUsed}회·위약금 ${prePenalty.toLocaleString()})${input.amountOverride != null ? " · 협의 금액" : ""}`,
    meta: { prev_status: msPre?.status ?? "active", prev_remaining: msPre?.remaining_sessions ?? 0, prev_end_date: msPre?.end_date ?? null },
    created_by: t.id,
  });
  if (evErr) console.error("[refund] event insert failed:", input.membershipId, evErr.message); // 이벤트는 이력 — 환불 자체는 확정
  // 환불 후 그 회원의 1:1 정기 스케줄 중지 — 떠난 회원 세션이 매주 무한 생성되던 문제(감사 H3).
  // 단, 그 회원에게 다른 활성 회원권이 남아 있으면(추가 결제·병행) 수업을 계속해야 하므로 건드리지 않는다(검증 후속).
  const memberId = msPre?.member_id as string | undefined;
  if (memberId) {
    const { data: others } = await sb
      .from("memberships").select("id")
      .eq("member_id", memberId).eq("status", "active").limit(1).maybeSingle();
    if (!others) await deactivateSoloSchedules(memberId);
  }
  revalidatePath("/t"); revalidatePath("/t/revenue"); revalidatePath("/t/members");
  return { ok: true, refund: refundAmt };
}

/** 환불 취소: 오클릭·금액 오류 복구. 음수 결제행 삭제 + 환불 직전 상태로 복원(스냅샷). 대표 전용. */
export async function undoRefund(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  // 최신 refund 이벤트의 스냅샷 (undone 제외)
  const { data: ev } = await sb.from("membership_events")
    .select("id, meta").eq("membership_id", membershipId).eq("type", "refund")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const meta = (ev?.meta ?? null) as { prev_status?: string; prev_remaining?: number; prev_end_date?: string; undone?: boolean } | null;
  if (!ev || !meta || meta.undone) return { ok: false, error: "취소할 환불 기록을 찾을 수 없어요" };
  // 원자 복원: refunded일 때만 전이(중복 취소 방지)
  const { data: claimed } = await sb.from("memberships")
    .update({ status: meta.prev_status ?? "active", remaining_sessions: meta.prev_remaining ?? 0, end_date: meta.prev_end_date ?? undefined })
    .eq("id", membershipId).eq("status", "refunded").select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "환불 상태가 아니에요" };
  // 환불 음수 결제행 제거 — 실패 시 refunded로 되돌려 반쪽 상태 방지(refundMembership 보상 패턴과 대칭)
  const { error: delErr } = await sb.from("payments")
    .delete().eq("membership_id", membershipId).lt("amount", 0);
  if (delErr) {
    await sb.from("memberships").update({ status: "refunded", remaining_sessions: 0 }).eq("id", membershipId);
    return { ok: false, error: "환불 내역 삭제에 실패했어요. 다시 시도해주세요." };
  }
  // 이벤트 기록은 이력 — 환불 취소 자체는 위에서 확정. 실패해도 삼키지 않고 로그만(refundMembership evErr 패턴과 대칭).
  const { error: markErr } = await sb.from("membership_events").update({ meta: { ...meta, undone: true } }).eq("id", ev.id);
  if (markErr) console.error("[undoRefund] event undone-mark failed:", membershipId, markErr.message);
  const { error: logErr } = await sb.from("membership_events").insert({ membership_id: membershipId, type: "refund", amount: 0, note: "취소(복원)", meta: { undone: true, undo_of: ev.id }, created_by: t.id });
  if (logErr) console.error("[undoRefund] audit event insert failed:", membershipId, logErr.message);
  revalidatePath("/t"); revalidatePath("/t/revenue"); revalidatePath("/t/members");
  revalidatePath("/console/revenue"); revalidatePath("/console/finance"); revalidatePath("/console/members"); // 콘솔 화면도 즉시 반영(감사3 #8)
  return { ok: true }; // 정기 스케줄은 자동 재활성화하지 않음 — UI 토스트로 안내
}

/** 양도: 회원권 통째 이전(member_id 교체). 대상=기존 회원 또는 신규 즉시 등록(새 결제 없음). */
export async function transferMembership(input: { membershipId: string; toMemberId?: string; toPhone?: string; newMember?: { name: string; phone: string; birth: string; gender: Gender } }): Promise<Result & { toMemberId?: string }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  let toId = input.toMemberId;
  // 휴대폰 번호로 기존 회원 조회(대표가 UUID를 알 수 없으므로 번호로 양도 대상 지정).
  if (!toId && input.toPhone) {
    const phone = input.toPhone.replace(/\D/g, "");
    if (!phone) return { ok: false, error: "휴대폰 번호를 입력해주세요" };
    const { data: m } = await sb.from("members").select("id").eq("phone", phone).maybeSingle();
    if (!m) return { ok: false, error: "해당 번호의 회원을 찾을 수 없어요" };
    toId = m.id as string;
  }
  if (!toId && input.newMember) {
    const n = input.newMember;
    const phone = n.phone.replace(/\D/g, "");
    const birthdate = parseBirth6(n.birth); // 실존 날짜 검증 — DB 에러가 '연락처 중복'으로 오인되던 문제(감사 #29)
    if (!birthdate) return { ok: false, error: "생년월일을 올바른 6자리(YYMMDD) 날짜로 입력해주세요" };
    const { data: m, error } = await sb.from("members").insert({ name: n.name.trim(), phone, birthdate, password_hash: hashPassword(n.birth.replace(/\D/g, "")), gender: n.gender, status: "active", avatar_tone: "sage" }).select("id").single();
    if (error || !m) return { ok: false, error: "양도 대상 등록 실패(연락처 중복?)" };
    await sb.from("member_trainers").insert({ member_id: m.id, trainer_id: t.id });
    toId = m.id;
  }
  if (!toId) return { ok: false, error: "양도 대상을 선택해주세요" };
  const { data: ms } = await sb.from("memberships").select("member_id, status").eq("id", input.membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if ((ms as { member_id: string; status: string }).status === "refunded") return { ok: false, error: "환불된 회원권은 양도할 수 없어요" };
  if ((ms as { member_id: string }).member_id === toId) return { ok: false, error: "이미 이 회원의 회원권이에요" };
  const { error: trErr } = await sb.from("memberships").update({ member_id: toId }).eq("id", input.membershipId);
  if (trErr) return { ok: false, error: "양도에 실패했어요. 다시 시도해주세요." }; // 감사 #22: 실패를 성공으로 표시하지 않는다
  await sb.from("membership_events").insert({ membership_id: input.membershipId, type: "transfer", note: `${ms.member_id} → ${toId}`, created_by: t.id });
  // 양도로 원 회원에게 활성 회원권이 남지 않으면 1:1 정기 스케줄 중지 — 떠난 회원의 유령 세션이
  // 매주 생성되던 문제(감사 #10). 환불(refundMembership)과 동일 규칙.
  const fromId = (ms as { member_id: string }).member_id;
  const { data: others } = await sb
    .from("memberships").select("id")
    .eq("member_id", fromId).eq("status", "active").limit(1).maybeSingle();
  if (!others) await deactivateSoloSchedules(fromId);
  revalidatePath("/t"); revalidatePath("/t/members");
  return { ok: true, toMemberId: toId };
}
