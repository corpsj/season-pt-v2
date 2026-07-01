import "server-only";
import { sb, getTrainerContext, nowKstParts } from "@/lib/data/db";
import { monthBoundsFromKst, monthLabelFromKst } from "@/lib/data/kst-bounds";

export type SettlementRow = {
  trainerId: string;
  name: string;
  role: string;
  count1on1: number;
  count2on1: number;
  rate1on1: number;
  rate2on1: number;
  payout: number;
};
export type Settlement = {
  monthOffset: number; // 0=이번 달, 1=지난 달 …
  monthLabel: string;
  rows: SettlementRow[];
  total: number;
};

/** 지정 월(현재-offset)의 강사별 회당 정산. attended 세션을 유형별로 세어 단가와 곱한다. 대표 전용. */
export async function getSettlement(monthOffset = 0): Promise<Settlement> {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const k = nowKstParts();
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - off, 1));
  const monthLabel = monthLabelFromKst(target);

  const t = await getTrainerContext();
  if (!t || t.role !== "owner") return { monthOffset: off, monthLabel, rows: [], total: 0 };

  const { startISO, endISO } = monthBoundsFromKst(target);

  const [{ data: trainers }, { data: sessions }] = await Promise.all([
    sb.from("trainers").select("id, display_name, role, rate_1on1, rate_2on1").neq("status", "inactive").order("role", { ascending: false }),
    sb.from("sessions").select("trainer_id, type").eq("status", "attended").gte("scheduled_at", startISO).lt("scheduled_at", endISO),
  ]);

  const counts = new Map<string, { a: number; b: number }>(); // a=1on1, b=2on1
  for (const s of sessions ?? []) {
    const c = counts.get(s.trainer_id) ?? { a: 0, b: 0 };
    if (s.type === "2on1") c.b++;
    else c.a++;
    counts.set(s.trainer_id, c);
  }

  const rows: SettlementRow[] = (trainers ?? []).map((tr) => {
    const c = counts.get(tr.id) ?? { a: 0, b: 0 };
    const rate1 = tr.rate_1on1 ?? 0;
    const rate2 = tr.rate_2on1 ?? 0;
    return {
      trainerId: tr.id,
      name: tr.display_name,
      role: tr.role,
      count1on1: c.a,
      count2on1: c.b,
      rate1on1: rate1,
      rate2on1: rate2,
      payout: c.a * rate1 + c.b * rate2,
    };
  });
  const total = rows.reduce((s, r) => s + r.payout, 0);
  return { monthOffset: off, monthLabel, rows, total };
}
