import "server-only";
import { sb, getMemberContext, kstDateISO } from "@/lib/data/db";
import { trainerCanAccess } from "./member-files";

export type BodyMeasurement = {
  id: string;
  weight: number | null;
  skeletalMuscle: number | null;
  bodyFat: number | null;
  measuredAt: string; // YYYY-MM-DD (KST)
};

async function listHistory(memberId: string, limit: number): Promise<BodyMeasurement[]> {
  const { data } = await sb
    .from("body_compositions")
    .select("id, weight, skeletal_muscle, body_fat, measured_at")
    .eq("member_id", memberId)
    .order("measured_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    weight: r.weight != null ? Number(r.weight) : null,
    skeletalMuscle: r.skeletal_muscle != null ? Number(r.skeletal_muscle) : null,
    bodyFat: r.body_fat != null ? Number(r.body_fat) : null,
    measuredAt: kstDateISO(r.measured_at as string),
  }));
}

/** 강사(담당)/대표 열람. 권한 없으면 빈 배열. */
export async function getBodyHistory(memberId: string, limit = 30): Promise<BodyMeasurement[]> {
  if (!(await trainerCanAccess(memberId))) return [];
  return listHistory(memberId, limit);
}

/** 회원 본인 열람. */
export async function getMyBodyHistory(limit = 30): Promise<BodyMeasurement[]> {
  const me = await getMemberContext();
  if (!me) return [];
  return listHistory(me.memberId, limit);
}
