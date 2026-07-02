"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, parseBirth6 } from "@/lib/data/db";
import { hashPassword } from "@/lib/auth/password";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { deactivateSoloSchedules } from "@/lib/data/groups/session-mutations";
import type { Gender, PaymentMethod } from "@/lib/types";

type Result = { ok: boolean; error?: string };

const normPhone = (p: string) => p.replace(/\D/g, "");

/** 상품 입력 서버측 검증 — 음수 회차/기간/가격이 그대로 저장되던 문제(감사 #43). */
function productError(input: { name: string; sessions: number; price: number; durationDays: number }): string | null {
  if (!input.name.trim()) return "상품명을 입력해주세요";
  if (!Number.isInteger(input.sessions) || input.sessions < 1) return "회차는 1 이상의 정수여야 해요";
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) return "기간(일)은 1 이상의 정수여야 해요";
  if (!Number.isFinite(input.price) || input.price < 0) return "가격을 확인해주세요";
  return null;
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
  const birthdate = parseBirth6(input.birth);
  if (!name) return { ok: false, error: "이름을 입력해주세요" };
  if (!phone) return { ok: false, error: "연락처를 입력해주세요" };
  if (!birthdate) return { ok: false, error: "생년월일을 올바른 6자리(YYMMDD) 날짜로 입력해주세요" };

  const password_hash = hashPassword(input.birth.replace(/\D/g, ""));
  const assignedTrainerId = input.trainerId ?? t.id;

  // 더블부킹 가드(감사 H6): 같은 강사에 같은 요일·시각 정기수업이 이미 있으면 등록 거부(당일 겹침 방지).
  for (const s of input.slots) {
    const { data: clash } = await sb
      .from("schedules")
      .select("id")
      .eq("trainer_id", assignedTrainerId)
      .eq("active", true)
      .eq("weekday", s.weekday)
      .eq("hour", s.hour)
      .eq("minute", s.minute)
      .limit(1)
      .maybeSingle();
    if (clash) {
      const wd = ["일", "월", "화", "수", "목", "금", "토"][s.weekday] ?? "";
      return { ok: false, error: `${wd} ${s.hour}시${s.minute ? " " + s.minute + "분" : ""}에 이미 다른 수업이 있어요. 다른 시간을 선택해주세요.` };
    }
  }

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

  // 담당 강사 연결 실패는 치명적(회원이 어느 강사에게도 안 보임) — 방금 만든 회원을 지우고 실패 처리(감사 #20).
  const { error: linkErr } = await sb
    .from("member_trainers")
    .insert({ member_id: member.id, trainer_id: assignedTrainerId });
  if (linkErr) {
    await sb.from("members").delete().eq("id", member.id);
    return { ok: false, error: "담당 강사 연결에 실패했어요. 다시 시도해주세요." };
  }

  // 선택 요일마다 정기 수업 스케줄 + 참여 회원 연결. 실패는 경고로 노출(감사 #20: 조용히 삼키지 않는다).
  let warn: string | undefined;
  for (const s of input.slots) {
    const { data: sched, error: schedErr } = await sb
      .from("schedules")
      .insert({ trainer_id: assignedTrainerId, type: "1on1", weekday: s.weekday, hour: s.hour, minute: s.minute, active: true })
      .select("id")
      .single();
    let smErr = schedErr;
    if (!smErr && sched) {
      const { error } = await sb.from("schedule_members").insert({ schedule_id: sched.id, member_id: member.id });
      smErr = error;
      if (error) await sb.from("schedules").delete().eq("id", sched.id); // 회원 없는 스케줄 잔류 방지
    }
    if (smErr) warn = "회원은 등록됐지만 일부 정기 수업 등록에 실패했어요. 회원 상세에서 다시 등록해주세요.";
  }

  // 회원권 발급 (옵션) — 하위 단계 실패는 회원 등록을 되돌리진 않되, 대표에게 경고로 노출(매출 누락 방지)
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

/** CSV 일괄 회원 등록. 행마다 createMember를 재사용해 검증·삽입을 공유한다. 대표 전용. */
export async function createMembersCsv(
  rows: { name: string; phone: string; birth: string; gender: Gender }[],
): Promise<Result & { created: number; failed: { name: string; phone: string; error: string }[] }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요", created: 0, failed: [] };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR, created: 0, failed: [] };
  if (rows.length === 0) return { ok: false, error: "등록할 회원이 없어요", created: 0, failed: [] };

  const failed: { name: string; phone: string; error: string }[] = [];
  let created = 0;
  for (const r of rows) {
    // ponytail: 행마다 createMember가 트레이너 컨텍스트를 다시 조회한다. CSV 규모(수십~수백 행)엔 충분; 대량 임포트로 커지면 컨텍스트 1회 캐시 + 일괄 insert로 승급.
    const res = await createMember({ name: r.name, phone: r.phone, birth: r.birth, gender: r.gender, slots: [] });
    if (res.ok) created++;
    else failed.push({ name: r.name, phone: r.phone, error: res.error ?? "등록 실패" });
  }
  return { ok: created > 0, created, failed };
}

/** 회원 정보 수정(이름·연락처·성별·부상메모·생년월일). 대표 전용. 연락처는 정규화 후 중복 시 거부.
 *  생년월일을 바꾸면 비밀번호(=생년월일 6자리)도 재설정하고 로그인 잠금을 해제한다 — 비번 분실 복구 수단 겸용. */
export async function updateMember(
  id: string,
  input: { name: string; phone: string; gender: Gender; injuryNote?: string; birth?: string },
): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const name = input.name.trim();
  const phone = normPhone(input.phone);
  if (!name) return { ok: false, error: "이름을 입력해주세요" };
  if (!phone) return { ok: false, error: "연락처를 입력해주세요" };

  const patch: Record<string, unknown> = { name, phone, gender: input.gender, injury_note: input.injuryNote?.trim() || null };
  const birth6 = input.birth?.replace(/\D/g, "") ?? "";
  if (birth6) {
    const birthdate = parseBirth6(birth6);
    if (!birthdate) return { ok: false, error: "생년월일을 올바른 6자리(YYMMDD) 날짜로 입력해주세요" };
    patch.birthdate = birthdate;
    patch.password_hash = hashPassword(birth6); // 비번=생년월일 고정 정책
  }

  const { error } = await sb.from("members").update(patch).eq("id", id);
  if (error) return { ok: false, error: "이미 사용 중인 연락처이거나 수정에 실패했어요" };
  // 잠금 해제(best-effort) — 스로틀 테이블 오류가 회원 수정 자체를 실패시키지 않게(member-actions clearFails와 동일 관례)
  try { if (birth6) await sb.from("member_login_attempts").delete().eq("phone", phone); } catch { /* best-effort */ }

  revalidatePath(`/t/members/${id}`);
  revalidatePath("/t/members");
  return { ok: true };
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
  // 결제자 스냅샷은 회원권 소유자를 단일 소스로 확정 조회(양도 후에도 결제내역이 원 결제자에게 남도록, 감사3 #14).
  // input.memberId를 신뢰하면 페이지 로드~제출 사이 양도 시 stale 결제자가 박힘 → 항상 membership row에서 새로 읽는다.
  const { data: payerRow } = await sb.from("memberships").select("member_id").eq("id", membershipId).maybeSingle();
  const payerMemberId: string | null = payerRow?.member_id ?? null;
  // 0원·null·음수 결제가 '기록 완료'로 통과해 장부에서 조용히 누락되던 문제(감사 #28).
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "결제 금액을 확인해주세요" };
  }
  amount = Math.round(amount);

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
    payer_member_id: payerMemberId,
  });
  if (error) return { ok: false, error: "결제 기록에 실패했어요" };

  revalidatePath("/t");
  return { ok: true };
}

/** 분할 결제 일괄 기록: 여러 라인을 한 번의 원자적 insert로. 라인별 부분 실패/재시도 이중기록 방지. */
export async function recordPayments(input: {
  memberId?: string;
  membershipId?: string;
  paidAt?: string;
  lines: { method: PaymentMethod; amount: number }[];
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const lines = input.lines.filter((l) => l.amount > 0);
  if (lines.length === 0) return { ok: false, error: "금액을 입력해주세요" };

  let membershipId = input.membershipId;
  if (!membershipId && input.memberId) {
    const { data: ms } = await sb
      .from("memberships")
      .select("id")
      .eq("member_id", input.memberId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    membershipId = ms?.id;
  }
  if (!membershipId) return { ok: false, error: "결제할 회원권을 찾지 못했어요" };
  // 결제자 스냅샷은 회원권 소유자를 단일 소스로 확정 조회(양도 후에도 결제내역이 원 결제자에게 남도록, 감사3 #14).
  // input.memberId를 신뢰하면 페이지 로드~제출 사이 양도 시 stale 결제자가 박힘 → 항상 membership row에서 새로 읽는다.
  const { data: payerRow } = await sb.from("memberships").select("member_id").eq("id", membershipId).maybeSingle();
  const payerMemberId: string | null = payerRow?.member_id ?? null;

  const paidAt = input.paidAt ?? todayISO();
  // 재시도 이중기록 방어: 직전 20초 내 '같은 시그니처(합계·건수)'의 배치가 이미 있으면 멱등 처리.
  // 합계·건수를 맞춰야 정당한 2차 분할결제(다른 금액)를 막지 않는다(검증 후속 — 단건 recordPayment의 정밀도와 일치).
  const totalAmt = lines.reduce((s, l) => s + Math.round(l.amount), 0);
  const since = new Date(Date.now() - 20000).toISOString();
  const { data: recent } = await sb.from("payments").select("amount")
    .eq("membership_id", membershipId).eq("paid_at", paidAt).gte("created_at", since);
  if (recent && recent.length === lines.length &&
      recent.reduce((s, r) => s + ((r.amount as number | null) ?? 0), 0) === totalAmt) {
    return { ok: true };
  }
  // 한 번의 다중행 insert는 Postgres에서 원자적(전부 성공 또는 전부 실패) → 부분기록 없음
  const { error } = await sb.from("payments").insert(
    lines.map((l) => ({ membership_id: membershipId, method: l.method, amount: Math.round(l.amount), paid_at: paidAt, recorded_by: t.id, payer_member_id: payerMemberId })),
  );
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

/* ----------------------- 회원·스케줄 라이프사이클 (대표 전용) ----------------------- */

/** 결제 기록 삭제(대표 전용). 금액 오입력 정정용 — 환불(음수) 행은 회원권 환불로만 처리(감사 H2). */
export async function deletePayment(paymentId: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { data: p } = await sb.from("payments").select("amount").eq("id", paymentId).maybeSingle();
  if (!p) return { ok: false, error: "결제 내역을 찾을 수 없어요" };
  if ((p.amount as number | null) != null && (p.amount as number) < 0)
    return { ok: false, error: "환불 내역은 회원권 환불 화면에서 처리해주세요" };
  const { error } = await sb.from("payments").delete().eq("id", paymentId);
  if (error) return { ok: false, error: "삭제에 실패했어요" };
  revalidatePath("/t/revenue");
  revalidatePath("/t/perf");
  revalidatePath("/console/revenue");
  revalidatePath("/console/finance");
  return { ok: true };
}

/** 회원 상태 전환(활성/휴면/비활성). 대표 전용. 비활성 시 1:1 정기 스케줄 자동 중지(세션 무한 생성 방지, 감사 H5·H3). */
export async function setMemberStatus(memberId: string, status: "active" | "rest" | "inactive"): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("members").update({ status }).eq("id", memberId);
  if (error) return { ok: false, error: "상태 변경에 실패했어요" };
  if (status === "inactive") await deactivateSoloSchedules(memberId);
  revalidatePath("/t/members");
  revalidatePath(`/t/members/${memberId}`);
  return { ok: true };
}

/** 정기 스케줄 활성/중지(대표 전용). 중지하면 향후 세션이 더 생성되지 않는다(감사 H3). */
export async function setScheduleActive(scheduleId: string, active: boolean): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("schedules").update({ active }).eq("id", scheduleId);
  if (error) return { ok: false, error: "스케줄 상태 변경에 실패했어요" };
  revalidatePath("/t/members");
  revalidatePath("/console");
  return { ok: true };
}

/** 강사 퇴사 인수인계: from 강사의 회원·정기스케줄·향후 세션·채팅을 to 강사로 이관(대표 전용, 감사 H4). */
export async function reassignMembers(fromTrainerId: string, toTrainerId: string): Promise<Result & { moved?: number }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  if (fromTrainerId === toTrainerId) return { ok: false, error: "같은 강사로는 이관할 수 없어요" };
  const { data: to } = await sb.from("trainers").select("id, status").eq("id", toTrainerId).maybeSingle();
  if (!to) return { ok: false, error: "이관 받을 강사를 찾을 수 없어요" };
  if (to.status === "inactive") return { ok: false, error: "비활성 강사에게는 이관할 수 없어요" };

  // 담당 회원 링크 이관(PK=(member_id,trainer_id) 충돌 방지: 이미 to에 연결된 회원은 from 링크만 제거).
  const { data: links } = await sb.from("member_trainers").select("member_id").eq("trainer_id", fromTrainerId);
  const memberIds = (links ?? []).map((l) => l.member_id as string);
  for (const mid of memberIds) {
    const { data: exists } = await sb
      .from("member_trainers").select("member_id")
      .eq("member_id", mid).eq("trainer_id", toTrainerId).maybeSingle();
    if (exists) await sb.from("member_trainers").delete().eq("member_id", mid).eq("trainer_id", fromTrainerId);
    else await sb.from("member_trainers").update({ trainer_id: toTrainerId }).eq("member_id", mid).eq("trainer_id", fromTrainerId);
  }
  // 정기 스케줄·향후 예정 세션 이관. 과거 출석 세션은 정산 귀속 위해 원 강사에 남긴다.
  await sb.from("schedules").update({ trainer_id: toTrainerId }).eq("trainer_id", fromTrainerId);
  await sb.from("sessions").update({ trainer_id: toTrainerId }).eq("trainer_id", fromTrainerId).eq("status", "scheduled");

  // 채팅 이관: to 강사가 이미 같은 회원과의 스레드를 가진 경우 옮기지 않는다(중복 방(room) 생성 방지, 검증 후속).
  const { data: fromThreads } = await sb.from("chat_threads").select("id, chat_participants(member_id)").eq("trainer_id", fromTrainerId);
  const { data: toThreads } = await sb.from("chat_threads").select("chat_participants(member_id)").eq("trainer_id", toTrainerId);
  const toSets = (toThreads ?? []).map((tt) => new Set(((tt as unknown as { chat_participants?: { member_id: string }[] }).chat_participants ?? []).map((p) => p.member_id)));
  for (const th of fromThreads ?? []) {
    const mids = ((th as unknown as { chat_participants?: { member_id: string }[] }).chat_participants ?? []).map((p) => p.member_id);
    const dup = mids.length > 0 && toSets.some((s) => mids.every((m) => s.has(m)) && s.size === mids.length);
    if (!dup) await sb.from("chat_threads").update({ trainer_id: toTrainerId }).eq("id", th.id as string);
  }

  revalidatePath("/t/staff");
  revalidatePath("/t/members");
  revalidatePath("/console");
  return { ok: true, moved: memberIds.length };
}

/* ----------------------- notices (공지) ----------------------- */

const NOTICE_TAG: Record<"important" | "ops" | "facility", string> = { important: "중요", ops: "운영", facility: "시설" };

/** 공지 작성(대표 전용). 회원 앱 공지사항에 노출. */
export async function createNotice(input: { title: string; body?: string; category: "important" | "ops" | "facility" }): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  if (!input.title.trim()) return { ok: false, error: "제목을 입력해주세요" };
  const { error } = await sb.from("notices").insert({
    title: input.title.trim(),
    body: input.body?.trim() || null,
    tone: input.category,
    tag: NOTICE_TAG[input.category],
    created_by: t.id,
  });
  if (error) return { ok: false, error: "공지 작성에 실패했어요" };
  revalidatePath("/t/settings/notices");
  return { ok: true };
}

/** 공지 삭제(대표 전용). */
export async function deleteNotice(id: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  const { error } = await sb.from("notices").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제에 실패했어요" };
  revalidatePath("/t/settings/notices");
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
  const invalid = productError(input);
  if (invalid) return { ok: false, error: invalid };
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
  const invalid = productError(input);
  if (invalid) return { ok: false, error: invalid };
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
