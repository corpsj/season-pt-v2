import "server-only";
import { sb, getTrainerContext, nowKstParts } from "@/lib/data/db";
import { monthBoundsFromKst, monthLabelFromKst } from "@/lib/data/kst-bounds";

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
  monthLabel: string;
  rows: SettlementRow[];
  total: number;
  confirmed: boolean;
};

/** 지정 월(현재-offset)의 강사별 회당 정산. attended 세션을 유형별로 세어 단가와 곱한다. 대표 전용. */
export async function getSettlement(monthOffset = 0): Promise<Settlement> {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const k = nowKstParts();
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - off, 1));
  const monthLabel = monthLabelFromKst(target);

  const t = await getTrainerContext();
  if (!t || t.role !== "owner") return { monthOffset: off, monthLabel, rows: [], total: 0, confirmed: false };

  const { startISO, endISO } = monthBoundsFromKst(target);
  const monthKey = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;

  const [{ data: trainers }, { data: sessions }, { data: settleRows }] = await Promise.all([
    sb.from("trainers").select("id, display_name, role, status, rate_1on1, rate_2on1").order("role", { ascending: false }),
    sb.from("sessions").select("trainer_id, type, pay_rate").eq("status", "attended").gte("scheduled_at", startISO).lt("scheduled_at", endISO),
    sb.from("expenses").select("id").eq("source", "settlement").eq("settle_month", monthKey).limit(1),
  ]);

  const meta = new Map((trainers ?? []).map((tr) => [tr.id as string, tr]));

  // 강사별 진행 세션 집계: count는 유형별, payout은 진행 시점 스냅샷 단가 합(없으면 현재 단가로 폴백).
  const acc = new Map<string, { a: number; b: number; pay: number }>();
  for (const s of sessions ?? []) {
    const c = acc.get(s.trainer_id) ?? { a: 0, b: 0, pay: 0 };
    const isTeam = s.type === "2on1";
    if (isTeam) c.b++;
    else c.a++;
    const tr = meta.get(s.trainer_id);
    const fallback = isTeam ? (tr?.rate_2on1 ?? 0) : (tr?.rate_1on1 ?? 0);
    c.pay += s.pay_rate ?? fallback;
    acc.set(s.trainer_id, c);
  }

  // 활성 강사 + 이번 달 진행 세션이 있는 (비활성 포함) 강사를 모두 포함 → 합계 누락 방지.
  const ids = new Set<string>();
  for (const tr of trainers ?? []) if (tr.status !== "inactive") ids.add(tr.id as string);
  for (const id of acc.keys()) ids.add(id);

  const rows: SettlementRow[] = [...ids]
    .map((id) => {
      const tr = meta.get(id);
      const c = acc.get(id) ?? { a: 0, b: 0, pay: 0 };
      return {
        trainerId: id,
        name: (tr?.display_name as string) ?? "(삭제된 강사)",
        role: (tr?.role as string) ?? "instructor",
        inactive: !tr || tr.status === "inactive",
        count1on1: c.a,
        count2on1: c.b,
        rate1on1: tr?.rate_1on1 ?? 0,
        rate2on1: tr?.rate_2on1 ?? 0,
        payout: c.pay,
      };
    })
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : b.payout - a.payout));

  const total = rows.reduce((s, r) => s + r.payout, 0);
  return { monthOffset: off, monthLabel, rows, total, confirmed: (settleRows?.length ?? 0) > 0 };
}
