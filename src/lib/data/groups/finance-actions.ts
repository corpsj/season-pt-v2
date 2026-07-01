"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, nowKstParts } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { getSettlement } from "@/lib/data/groups/settlement";
import { settlementLaborRows } from "@/lib/data/finance-calc";

type Result = { ok: boolean; error?: string };

const CATEGORIES = ["labor", "rent", "utility", "marketing", "supply", "etc"] as const;
type Category = (typeof CATEGORIES)[number];

/** monthOffset → 대상 월 키('YYYY-MM')와 그 달 KST 말일('YYYY-MM-DD'). getSettlement와 동일 off 규약. */
function monthKeys(monthOffset: number): { monthKey: string; lastDay: string } {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const k = nowKstParts();
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth() - off;
  const monthKey = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { monthKey, lastDay };
}

export async function addExpense(input: {
  category: Category;
  amount: number;
  spentAt?: string;
  note?: string;
  trainerId?: string;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  if (!input.amount || input.amount <= 0) return { ok: false, error: "금액을 입력해주세요" };
  if (!CATEGORIES.includes(input.category)) return { ok: false, error: "분류를 선택해주세요" };

  const { error } = await sb.from("expenses").insert({
    category: input.category,
    amount: Math.round(input.amount),
    spent_at: input.spentAt || todayISO(),
    note: input.note?.trim() || null,
    trainer_id: input.category === "labor" ? (input.trainerId ?? null) : null,
    source: "manual",
    recorded_by: t.id,
  });
  if (error) return { ok: false, error: "지출 추가에 실패했어요" };
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { data: row } = await sb.from("expenses").select("source").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "지출을 찾을 수 없어요" };
  if (row.source === "settlement")
    return { ok: false, error: "정산 지급 항목은 정산 화면에서 취소해주세요" };

  const { error } = await sb.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제에 실패했어요" };
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function confirmSettlement(monthOffset = 0): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { monthKey, lastDay } = monthKeys(monthOffset);
  const s = await getSettlement(monthOffset);

  // 멱등: 그 달 정산 인건비 행 전량 삭제 후 재삽입. // ponytail: delete→insert 비원자적(2요청), 실패 시 미확정 롤백 → 재클릭 자기치유.
  await sb.from("expenses").delete().eq("source", "settlement").eq("settle_month", monthKey);

  const rows = settlementLaborRows(s.rows, { monthKey, spentAt: lastDay, recordedBy: t.id });
  if (rows.length > 0) {
    const { error } = await sb.from("expenses").insert(rows);
    if (error) return { ok: false, error: "정산 확정에 실패했어요" };
  }
  revalidatePath("/console/settlement");
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function unconfirmSettlement(monthOffset = 0): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { monthKey } = monthKeys(monthOffset);
  const { error } = await sb.from("expenses").delete().eq("source", "settlement").eq("settle_month", monthKey);
  if (error) return { ok: false, error: "확정 취소에 실패했어요" };
  revalidatePath("/console/settlement");
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}
