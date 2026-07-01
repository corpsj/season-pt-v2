"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";

type Result = { ok: boolean; error?: string };

/** 강사 회당 단가(1on1 / 2on1) 설정. 대표 전용. */
export async function setTrainerRates(trainerId: string, rate1on1: number, rate2on1: number): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const r1 = Math.max(0, Math.round(Number(rate1on1) || 0));
  const r2 = Math.max(0, Math.round(Number(rate2on1) || 0));
  const { error } = await sb.from("trainers").update({ rate_1on1: r1, rate_2on1: r2 }).eq("id", trainerId);
  if (error) return { ok: false, error: "단가 저장에 실패했어요" };

  revalidatePath("/console/settlement");
  return { ok: true };
}
