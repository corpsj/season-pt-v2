"use server";
import { revalidatePath } from "next/cache";
import { sb, getMemberContext } from "@/lib/data/db";
import { validateUpload } from "@/lib/media/upload-guard";
import { FILES_BUCKET, trainerCanAccess } from "./member-files";
import { getMyMeals, type MealsPage } from "./meals";

type Result = { ok: boolean; error?: string };

/** 회원 본인 식단 더보기(무한스크롤 아님, 버튼 클릭 페이지네이션) — getMyMeals와 동일 권한. */
export async function loadMoreMeals(offset: number): Promise<MealsPage> {
  return getMyMeals(offset);
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MEAL_TYPES = ["아침", "점심", "저녁", "간식"];

/** 회원 본인이 식단(사진 선택 + 메모)을 기록. */
export async function logMeal(formData: FormData): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };

  const memo = (formData.get("memo") as string | null)?.trim() || null;
  const mealTypeRaw = (formData.get("mealType") as string | null)?.trim() || null;
  const mealType = mealTypeRaw && MEAL_TYPES.includes(mealTypeRaw) ? mealTypeRaw : null;
  const file = formData.get("photo");
  if (!memo && !(file instanceof File)) return { ok: false, error: "사진이나 메모를 입력해주세요" };

  let photoPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const v = validateUpload("photo", file.type, file.size);
    if (!v.ok) return { ok: false, error: v.error };
    const ext = EXT[file.type] ?? "jpg";
    photoPath = `${me.memberId}/meal/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await sb.storage.from(FILES_BUCKET).upload(photoPath, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: "사진 업로드에 실패했어요" };
  }

  const { error: insErr } = await sb.from("meal_logs").insert({
    member_id: me.memberId,
    photo_path: photoPath,
    memo,
    meal_type: mealType,
  });
  if (insErr) {
    if (photoPath) await sb.storage.from(FILES_BUCKET).remove([photoPath]); // 고아 롤백
    return { ok: false, error: "기록에 실패했어요" };
  }

  revalidatePath("/m/my/meals");
  revalidatePath("/m"); // 캘린더 날짜별 식단도 갱신
  return { ok: true };
}

/** 회원 본인이 자신의 식단 기록 삭제. */
export async function deleteMeal(mealId: string): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };
  const { data: row } = await sb.from("meal_logs").select("member_id, photo_path").eq("id", mealId).maybeSingle();
  if (!row || row.member_id !== me.memberId) return { ok: false, error: "기록을 찾을 수 없어요" };

  if (row.photo_path) await sb.storage.from(FILES_BUCKET).remove([row.photo_path as string]);
  const { error } = await sb.from("meal_logs").delete().eq("id", mealId);
  if (error) return { ok: false, error: "삭제에 실패했어요" };

  revalidatePath("/m/my/meals");
  revalidatePath("/m"); // 캘린더 날짜별 식단도 갱신
  return { ok: true };
}

/** 강사(담당)/대표가 회원 식단 기록에 피드백 작성·수정. */
export async function addMealFeedback(mealId: string, text: string): Promise<Result> {
  const { data: row } = await sb.from("meal_logs").select("member_id").eq("id", mealId).maybeSingle();
  if (!row) return { ok: false, error: "기록을 찾을 수 없어요" };
  const access = await trainerCanAccess(row.member_id as string);
  if (!access) return { ok: false, error: "권한이 없어요" };

  const feedback = text.trim();
  if (!feedback) return { ok: false, error: "피드백을 입력해주세요" };

  const { error } = await sb
    .from("meal_logs")
    .update({ feedback, feedback_by: access.trainerId, feedback_at: new Date().toISOString() })
    .eq("id", mealId);
  if (error) return { ok: false, error: "피드백 저장에 실패했어요" };

  revalidatePath(`/t/members/${row.member_id as string}`);
  revalidatePath("/m/my/meals");
  revalidatePath("/m"); // 캘린더 날짜별 식단도 갱신
  return { ok: true };
}
