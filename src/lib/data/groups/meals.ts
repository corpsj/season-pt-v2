import "server-only";
import { sb, getMemberContext } from "@/lib/data/db";
import { FILES_BUCKET, trainerCanAccess } from "./member-files";

const SIGNED_TTL = 60 * 60; // 1시간

export type MealLog = {
  id: string;
  photoUrl: string | null;
  memo: string | null;
  mealType: string | null;
  eatenAt: string; // ISO
  feedback: string | null;
  feedbackAt: string | null; // ISO | null
};

// ponytail: 3줄짜라 서명 헬퍼 — member-files의 동일 로직을 export하기보다 지역 복제(결합 최소화).
async function signed(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

async function listMeals(memberId: string): Promise<MealLog[]> {
  const { data } = await sb
    .from("meal_logs")
    .select("id, photo_path, memo, meal_type, eaten_at, feedback, feedback_at")
    .eq("member_id", memberId)
    .order("eaten_at", { ascending: false });
  return Promise.all(
    (data ?? []).map(async (r) => ({
      id: r.id as string,
      photoUrl: await signed(r.photo_path as string | null),
      memo: (r.memo as string | null) ?? null,
      mealType: (r.meal_type as string | null) ?? null,
      eatenAt: r.eaten_at as string,
      feedback: (r.feedback as string | null) ?? null,
      feedbackAt: (r.feedback_at as string | null) ?? null,
    })),
  );
}

/** 강사/대표 열람. 권한 없으면 빈 배열. */
export async function getMemberMeals(memberId: string): Promise<MealLog[]> {
  if (!(await trainerCanAccess(memberId))) return [];
  return listMeals(memberId);
}

/** 회원 본인 열람. */
export async function getMyMeals(): Promise<MealLog[]> {
  const me = await getMemberContext();
  if (!me) return [];
  return listMeals(me.memberId);
}
