"use server";
import { revalidatePath } from "next/cache";
import { sb } from "@/lib/data/db";
import { trainerCanAccess } from "./member-files";
import { getBodyHistory, type BodyMeasurement } from "./body";

type Result = { ok: boolean; error?: string };

/** 소수 1자리까지 허용하는 양수 파싱. 빈값/비정상 → null. */
function parseMeasure(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function revalidateBody(memberId: string) {
  revalidatePath(`/t/members/${memberId}`);
  revalidatePath("/m/my/body");
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

  const row: Record<string, unknown> = { member_id: memberId, weight, skeletal_muscle: skeletalMuscle, body_fat: bodyFat };
  // measured_at은 timestamptz — YYYY-MM-DD를 주면 자정 UTC로 저장(KST 같은 날짜). 미지정=DB default now().
  if (input.measuredAt && /^\d{4}-\d{2}-\d{2}$/.test(input.measuredAt)) row.measured_at = input.measuredAt;

  const { error } = await sb.from("body_compositions").insert(row);
  if (error) return { ok: false, error: "저장에 실패했어요" };
  revalidateBody(memberId);
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
