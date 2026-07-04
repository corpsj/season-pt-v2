"use server";
import { revalidatePath } from "next/cache";
import { sb, getMemberContext } from "@/lib/data/db";
import type { WorkoutExercise } from "@/lib/types";

type Result = { ok: boolean; error?: string };

/** YYYY-MM-DD(선택) → 지난 날짜면 정오 KST ISO. 오늘/미지정은 null(=DB default now() 유지). 미래면 "future". */
function resolveCreatedAt(raw: string | null): string | null | "future" {
  const date = raw?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
  if (date > todayKst) return "future";
  if (date === todayKst) return null; // 오늘이면 실제 시각(now()) 보존
  return new Date(`${date}T12:00:00+09:00`).toISOString();
}

/** 회원 제출 운동 배열 정제(신뢰 경계) — 이름 40자·수치 0~9999 정수·종목 30개 상한. */
function sanitize(exercises: WorkoutExercise[]): WorkoutExercise[] {
  const num = (v: unknown) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(9999, Math.max(0, n)) : 0;
  };
  return (Array.isArray(exercises) ? exercises : [])
    .map((e) => ({
      name: String(e?.name ?? "").trim().slice(0, 40),
      kg: num(e?.kg),
      sets: num(e?.sets),
      reps: e?.reps == null ? undefined : num(e?.reps),
    }))
    .filter((e) => e.name.length > 0)
    .slice(0, 30);
}

/**
 * 회원 본인이 (수업과 무관한) 자유 운동을 직접 기록. session_id·created_by는 null 로 남겨
 * 강사 수업 기록과 구분한다. 날짜 미지정/오늘이면 now(), 지난 날짜는 정오 KST로 created_at 지정.
 */
export async function logMyWorkout(
  exercises: WorkoutExercise[],
  comment: string,
  date: string | null,
): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };

  const ex = sanitize(exercises);
  const cmt = comment.trim().slice(0, 1000) || null;
  if (ex.length === 0 && !cmt) return { ok: false, error: "운동 종목이나 메모를 입력해주세요" };

  const createdAt = resolveCreatedAt(date);
  if (createdAt === "future") return { ok: false, error: "미래 날짜는 기록할 수 없어요" };

  const { error } = await sb.from("workout_records").insert({
    member_id: me.memberId,
    session_id: null,
    exercises: ex,
    comment: cmt,
    created_by: null,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (error) return { ok: false, error: "기록에 실패했어요" };

  revalidatePath("/m/my/records");
  revalidatePath("/m"); // 캘린더 날짜별 운동 기록 갱신
  return { ok: true };
}

/** 회원 본인이 직접 남긴 기록만 삭제 — created_by가 있는(강사 작성) 기록은 못 지운다. */
export async function deleteMyWorkout(recordId: string): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };
  const { data: row } = await sb
    .from("workout_records")
    .select("member_id, created_by")
    .eq("id", recordId)
    .maybeSingle();
  if (!row || row.member_id !== me.memberId || row.created_by !== null)
    return { ok: false, error: "삭제할 수 없는 기록이에요" };

  const { error } = await sb.from("workout_records").delete().eq("id", recordId);
  if (error) return { ok: false, error: "삭제에 실패했어요" };

  revalidatePath("/m/my/records");
  revalidatePath("/m");
  return { ok: true };
}
