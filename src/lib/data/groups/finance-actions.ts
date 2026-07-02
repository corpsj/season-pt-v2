"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, nowKstParts } from "@/lib/data/db";
import { monthBoundsFromKst } from "@/lib/data/kst-bounds";
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

/**
 * 화면이 보여주던 절대 월('YYYY-MM') → 현재 시점 기준 offset. 상대 offset만 쓰면 KST 월 전환
 * 순간(자정 직후 클릭)에 다른 달을 확정·삭제한다(감사 #32) — UI가 본 달을 그대로 고정.
 */
function offsetForMonthKey(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  const k = nowKstParts();
  return Math.max(0, k.getUTCFullYear() * 12 + k.getUTCMonth() - (y * 12 + (m - 1)));
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

export async function confirmSettlement(monthOffset = 0, fixedMonthKey?: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const off = fixedMonthKey ? offsetForMonthKey(fixedMonthKey) : monthOffset;
  const { monthKey, lastDay } = monthKeys(off);

  // 단가 미설정(0)으로 pay_rate가 null인 진행 세션에 현재 단가를 백필(확정 시점 동결) —
  // '단가는 나중에 입력' 운영 지원(감사 high #1). 이후 단가를 바꿔도 확정된 달의 세션 값은 불변.
  const [ykStr, mkStr] = monthKey.split("-");
  const { startISO, endISO } = monthBoundsFromKst(new Date(Date.UTC(Number(ykStr), Number(mkStr) - 1, 1)));
  const { data: rateRows } = await sb.from("trainers").select("id, rate_1on1, rate_2on1");
  for (const tr of rateRows ?? []) {
    for (const [type, rate] of [["1on1", tr.rate_1on1 as number], ["2on1", tr.rate_2on1 as number]] as const) {
      if (rate > 0) {
        await sb
          .from("sessions")
          .update({ pay_rate: rate })
          .eq("trainer_id", tr.id)
          .eq("status", "attended")
          .eq("type", type)
          .is("pay_rate", null)
          .gte("scheduled_at", startISO)
          .lt("scheduled_at", endISO);
      }
    }
  }

  const s = await getSettlement(off);

  // 멱등: 그 달 정산 인건비 행 전량 삭제 후 재삽입. 기기 간 동시 확정의 이중 삽입은
  // 0017 partial unique(settle_month, trainer_id where source='settlement')가 백스톱(감사 #34).
  // ponytail: delete→insert 비원자적(2요청), 실패 시 미확정 롤백 → 재클릭 자기치유.
  const { error: delErr } = await sb.from("expenses").delete().eq("source", "settlement").eq("settle_month", monthKey);
  if (delErr) return { ok: false, error: "정산 확정에 실패했어요" };

  const rows = settlementLaborRows(s.rows, { monthKey, spentAt: lastDay, recordedBy: t.id });
  if (rows.length > 0) {
    const { error } = await sb.from("expenses").insert(rows);
    if (error) return { ok: false, error: "정산 확정에 실패했어요. 다시 시도해주세요." };
  }
  revalidatePath("/console/settlement");
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function unconfirmSettlement(monthOffset = 0, fixedMonthKey?: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { monthKey } = fixedMonthKey
    ? { monthKey: fixedMonthKey }
    : monthKeys(monthOffset);
  const { error } = await sb.from("expenses").delete().eq("source", "settlement").eq("settle_month", monthKey);
  if (error) return { ok: false, error: "확정 취소에 실패했어요" };
  revalidatePath("/console/settlement");
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}
