"use server";
import { revalidatePath } from "next/cache";
import { sb, getMemberContext } from "@/lib/data/db";
import { trainerCanAccess } from "./member-files";
import { getBodyHistory, type BodyMeasurement } from "./body";

type Result = { ok: boolean; error?: string };

/** 소수 1자리까지 허용하는 양수 파싱(상한 500 — 오타 방어). 빈값/비정상 → null. */
function parseMeasure(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  return Math.round(n * 10) / 10;
}

/** YYYY-MM-DD 검증 + 미래 거부. 유효하면 그대로, 아니면 null(=DB default now()), 미래면 "future". */
function resolveMeasuredAt(raw: string | null | undefined): string | null | "future" {
  const date = raw?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  if (date > todayKst) return "future";
  return date;
}

function revalidateBody(memberId: string) {
  revalidatePath(`/t/members/${memberId}`);
  revalidatePath("/m/my/body");
  revalidatePath("/m"); // 캘린더 날짜별 체성분
  revalidatePath("/console/members");
}

/** 강사(담당)/대표가 회원 체성분을 기록. 3개 중 1개 이상 있어야 저장. */
export async function saveBodyComposition(
  memberId: string,
  input: { weight?: unknown; skeletalMuscle?: unknown; bodyFat?: unknown; measuredAt?: string | null },
): Promise<Result> {
  if (!memberId) return { ok: false, error: "잘못된 요청이에요" };
  if (!(await trainerCanAccess(memberId))) return { ok: false, error: "권한이 없어요" };

  const weight = parseMeasure(input.weight);
  const skeletalMuscle = parseMeasure(input.skeletalMuscle);
  const bodyFat = parseMeasure(input.bodyFat);
  if (weight == null && skeletalMuscle == null && bodyFat == null)
    return { ok: false, error: "한 가지 이상 입력해 주세요" };

  const measuredAt = resolveMeasuredAt(input.measuredAt);
  if (measuredAt === "future") return { ok: false, error: "미래 날짜는 기록할 수 없어요" };

  const row: Record<string, unknown> = { member_id: memberId, weight, skeletal_muscle: skeletalMuscle, body_fat: bodyFat };
  // measured_at은 timestamptz — YYYY-MM-DD를 주면 자정 UTC로 저장(KST 같은 날짜). 미지정=DB default now().
  if (measuredAt) row.measured_at = measuredAt;

  const { error } = await sb.from("body_compositions").insert(row);
  if (error) return { ok: false, error: "저장에 실패했어요" };
  revalidateBody(memberId);
  return { ok: true };
}

/** 회원 본인이 체성분을 직접 기록(집 체중계 등). self_recorded=true, 지난 날짜 허용·미래 거부. */
export async function logMyBodyComposition(input: {
  weight?: unknown;
  skeletalMuscle?: unknown;
  bodyFat?: unknown;
  measuredAt?: string | null;
}): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };

  const weight = parseMeasure(input.weight);
  const skeletalMuscle = parseMeasure(input.skeletalMuscle);
  const bodyFat = parseMeasure(input.bodyFat);
  if (weight == null && skeletalMuscle == null && bodyFat == null)
    return { ok: false, error: "한 가지 이상 입력해 주세요" };

  const measuredAt = resolveMeasuredAt(input.measuredAt);
  if (measuredAt === "future") return { ok: false, error: "미래 날짜는 기록할 수 없어요" };

  const row: Record<string, unknown> = {
    member_id: me.memberId,
    weight,
    skeletal_muscle: skeletalMuscle,
    body_fat: bodyFat,
    self_recorded: true,
  };
  if (measuredAt) row.measured_at = measuredAt;

  const { error } = await sb.from("body_compositions").insert(row);
  if (error) return { ok: false, error: "저장에 실패했어요" };
  revalidateBody(me.memberId);
  return { ok: true };
}

/** 회원 본인이 직접 남긴(self_recorded) 체성분 기록만 삭제 — 강사 측정 기록은 못 지운다. */
export async function deleteMyBodyComposition(id: string): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };
  const { data: row } = await sb
    .from("body_compositions")
    .select("member_id, self_recorded")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.member_id !== me.memberId || !row.self_recorded)
    return { ok: false, error: "삭제할 수 없는 기록이에요" };

  const { error } = await sb.from("body_compositions").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제에 실패했어요" };
  revalidateBody(me.memberId);
  return { ok: true };
}

/** 강사(담당)/대표가 체성분 기록 삭제 — 행의 member_id로 권한 검증. */
export async function deleteBodyComposition(id: string): Promise<Result> {
  const { data: row } = await sb.from("body_compositions").select("member_id").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "기록을 찾을 수 없어요" };
  const memberId = row.member_id as string;
  if (!(await trainerCanAccess(memberId))) return { ok: false, error: "권한이 없어요" };

  const { error } = await sb.from("body_compositions").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제에 실패했어요" };
  revalidateBody(memberId);
  return { ok: true };
}

/** 콘솔(클라이언트)에서 회원 선택 시 체성분 이력 조회 — getBodyHistory가 권한 검증. */
export async function listBodyHistory(memberId: string): Promise<BodyMeasurement[]> {
  return getBodyHistory(memberId);
}
