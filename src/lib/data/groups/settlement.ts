import "server-only";
import { sb, getTrainerContext, nowKstParts } from "@/lib/data/db";
import { monthBoundsFromKst, monthLabelFromKst } from "@/lib/data/kst-bounds";
import { computePayout } from "@/lib/data/settlement-calc";

export type SettlementRow = {
  trainerId: string;
  name: string;
  role: string;
  inactive: boolean;
  count1on1: number;
  count2on1: number;
  rate1on1: number; // 현재 기본 단가(향후 진행 세션에 적용)
  rate2on1: number;
  payout: number; // 진행 시점 스냅샷 단가 합
};
export type Settlement = {
  monthOffset: number; // 0=이번 달, 1=지난 달 …
  monthKey: string; // 'YYYY-MM' — 확정/취소 시 절대 월 고정용(감사 #32: 월 전환 순간 오확정 방지)
  monthLabel: string;
  rows: SettlementRow[];
  total: number;
  confirmed: boolean;
  stale: boolean; // 확정 후 출석이 바뀌어 스냅샷(인건비)과 현재 정산액이 어긋난 상태(감사 H15)
};

/** 지정 월(현재-offset)의 강사별 회당 정산. attended 세션을 유형별로 세어 단가와 곱한다. 대표 전용. */
export async function getSettlement(monthOffset = 0): Promise<Settlement> {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const k = nowKstParts();
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - off, 1));
  const monthLabel = monthLabelFromKst(target);

  const monthKey = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
  const t = await getTrainerContext();
  if (!t || t.role !== "owner") return { monthOffset: off, monthKey, monthLabel, rows: [], total: 0, confirmed: false, stale: false };

  const { startISO, endISO } = monthBoundsFromKst(target);

  const [{ data: trainers }, { data: sessions }, { data: settleRows }] = await Promise.all([
    sb.from("trainers").select("id, display_name, role, status, rate_1on1, rate_2on1").order("role", { ascending: false }),
    sb.from("sessions").select("trainer_id, type, pay_rate").eq("status", "attended").gte("scheduled_at", startISO).lt("scheduled_at", endISO),
    sb.from("expenses").select("amount").eq("source", "settlement").eq("settle_month", monthKey),
  ]);

  const meta = new Map((trainers ?? []).map((tr) => [tr.id as string, tr]));

  // 강사별로 진행 세션을 모아 computePayout(순수 계산)으로 집계 — 스냅샷 단가 우선, 없으면 현재 단가 폴백.
  const byTrainer = new Map<string, { type: string; payRate: number | null }[]>();
  for (const s of sessions ?? []) {
    const arr = byTrainer.get(s.trainer_id) ?? [];
    arr.push({ type: s.type, payRate: s.pay_rate });
    byTrainer.set(s.trainer_id, arr);
  }

  // 활성 강사 + 이번 달 진행 세션이 있는 (비활성 포함) 강사를 모두 포함 → 합계 누락 방지.
  const ids = new Set<string>();
  for (const tr of trainers ?? []) if (tr.status !== "inactive") ids.add(tr.id as string);
  for (const id of byTrainer.keys()) ids.add(id);

  const rows: SettlementRow[] = [...ids]
    .map((id) => {
      const tr = meta.get(id);
      const rate1on1 = tr?.rate_1on1 ?? 0;
      const rate2on1 = tr?.rate_2on1 ?? 0;
      const { count1on1, count2on1, payout } = computePayout(byTrainer.get(id) ?? [], rate1on1, rate2on1);
      return {
        trainerId: id,
        name: (tr?.display_name as string) ?? "(삭제된 강사)",
        role: (tr?.role as string) ?? "instructor",
        inactive: !tr || tr.status === "inactive",
        count1on1,
        count2on1,
        rate1on1,
        rate2on1,
        payout,
      };
    })
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : b.payout - a.payout));

  const total = rows.reduce((s, r) => s + r.payout, 0);

  // 확정 여부 + 확정 이후 출석 변경으로 스냅샷이 어긋났는지(재확정 필요) 판정.
  // 스냅샷 인건비(대표 제외 payout>0 강사)와 현재 라이브 인건비를 비교(감사 H15).
  const confirmed = (settleRows?.length ?? 0) > 0;
  const storedLabor = (settleRows ?? []).reduce((s, r) => s + ((r.amount as number | null) ?? 0), 0);
  const liveLabor = rows.filter((r) => r.role !== "owner" && r.payout > 0).reduce((s, r) => s + r.payout, 0);
  const stale = confirmed && storedLabor !== liveLabor;

  return { monthOffset: off, monthKey, monthLabel, rows, total, confirmed, stale };
}

/**
 * 로그인 강사 **본인**의 이번 달 예상 정산액(확정 전). 본인 세션·본인 단가만 조회한다 —
 * 타 강사 데이터·확정 여부·지출 정보는 조회 자체를 하지 않는다. 비로그인이면 null.
 */
export async function getMySettlementPreview(): Promise<{
  monthLabel: string;
  count1on1: number;
  count2on1: number;
  payout: number;
} | null> {
  const t = await getTrainerContext();
  if (!t) return null;

  const now = nowKstParts();
  const monthLabel = monthLabelFromKst(now);
  const { startISO, endISO } = monthBoundsFromKst(now);

  const [{ data: me }, { data: sessions }] = await Promise.all([
    sb.from("trainers").select("rate_1on1, rate_2on1").eq("id", t.id).maybeSingle(),
    sb
      .from("sessions")
      .select("type, pay_rate")
      .eq("status", "attended")
      .eq("trainer_id", t.id)
      .gte("scheduled_at", startISO)
      .lt("scheduled_at", endISO),
  ]);

  const { count1on1, count2on1, payout } = computePayout(
    (sessions ?? []).map((s) => ({ type: s.type, payRate: s.pay_rate })),
    me?.rate_1on1 ?? 0,
    me?.rate_2on1 ?? 0,
  );
  return { monthLabel, count1on1, count2on1, payout };
}

/**
 * 대표 대시보드용 정산 미확정 투두. owner 아니면 null.
 * 지난달에 강사(대표 제외) 지급분이 있는데 미확정이면 {kind:"last"};
 * 아니면 KST 25일 이후이고 이번 달이 같은 조건이면 {kind:"current"}; 그 외 null.
 */
export async function getSettlementTodo(): Promise<{
  monthKey: string;
  monthLabel: string;
  kind: "last" | "current";
} | null> {
  const t = await getTrainerContext();
  if (!t || t.role !== "owner") return null;

  const hasUnconfirmedLabor = (s: Settlement) =>
    !s.confirmed && s.rows.some((r) => r.role !== "owner" && r.payout > 0);

  const last = await getSettlement(1); // 1 = 지난 달 (offset은 0 미만이 0으로 클램프됨)
  if (hasUnconfirmedLabor(last)) return { monthKey: last.monthKey, monthLabel: last.monthLabel, kind: "last" };

  if (nowKstParts().getUTCDate() >= 25) {
    const cur = await getSettlement(0);
    if (hasUnconfirmedLabor(cur)) return { monthKey: cur.monthKey, monthLabel: cur.monthLabel, kind: "current" };
  }
  return null;
}
