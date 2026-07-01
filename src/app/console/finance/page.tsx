import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Topbar } from "@/components/console/Topbar";
import { Card, won } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { getFinanceSummary, getExpenses } from "@/lib/data/groups/finance";
import { getStaff } from "@/lib/data/groups/owner-ops";
import { ExpenseLedger } from "./ui";

const CAT_COLOR: Record<string, string> = {
  labor: "#768c6a", rent: "#b89a5e", utility: "#6e8aa0",
  marketing: "#c67352", supply: "#8fa187", etc: "#a89a80",
};

function NavArrow({ to, dir, disabled }: { to: number; dir: "prev" | "next"; disabled?: boolean }) {
  const cls = "flex h-9 w-9 items-center justify-center rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60] transition hover:bg-[#F4F0E8]";
  if (disabled) return <span className={`${cls} pointer-events-none opacity-40`}><Icon name={dir === "prev" ? "chevron-left" : "chevron-right"} size={17} /></span>;
  return (
    <Link href={to <= 0 ? "/console/finance" : `/console/finance?m=${to}`} className={cls} aria-label={dir === "prev" ? "이전 달" : "다음 달"}>
      <Icon name={dir === "prev" ? "chevron-left" : "chevron-right"} size={17} />
    </Link>
  );
}

export default async function ConsoleFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const off = Math.max(0, Number(sp.m ?? "0") || 0);
  const [summary, exp, staff] = await Promise.all([getFinanceSummary(off), getExpenses(off), getStaff()]);
  const staffPicks = staff.filter((s) => s.role !== "invited").map((s) => ({ id: s.id, name: s.name }));

  const net = summary.netProfit;
  const bars = summary.byCategory.filter((c) => c.amount > 0);

  return (
    <>
      <Topbar title="손익" sub={`${summary.monthLabel} · 손익 요약`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        {/* 월 네비 */}
        <div className="mb-5 flex items-center gap-1.5">
          <NavArrow to={off + 1} dir="prev" />
          <span className="min-w-[104px] text-center text-[15px] font-bold text-ink">{summary.monthLabel}</span>
          <NavArrow to={off - 1} dir="next" disabled={off <= 0} />
        </div>

        {/* 손익 히어로 */}
        <div className="mb-4 flex items-end justify-between gap-5 rounded-[18px] px-6 py-[22px]"
          style={{ background: net >= 0 ? "#768C6A" : "#C67352", boxShadow: "0 14px 30px -22px rgba(75,59,46,0.5)" }}>
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-[#D7DCCF]">{summary.monthLabel.replace(/^\d+년 /, "")} 순이익</div>
            <Money className="serif whitespace-nowrap text-[38px] font-semibold leading-[0.9] text-surface">{won(net)}</Money>
            {summary.netDeltaPct != null ? (
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="inline-flex items-center gap-[3px] rounded-[7px] bg-[#E7DCC5] px-[9px] py-1 text-[12px] font-bold text-[#26231E]"><Icon name="arrow-up-right" size={13} />{summary.netDeltaPct >= 0 ? "+" : ""}{summary.netDeltaPct}%</span>
                <span className="text-[12px] font-medium text-[#D7DCCF]">전월 대비</span>
              </div>
            ) : null}
            <div className="mt-4 flex gap-5">
              <div><div className="mb-[3px] text-[11px] font-medium text-[#CBD2BE]">매출</div><Money className="text-[14px] font-bold text-surface">{won(summary.revenue)}</Money></div>
              <div><div className="mb-[3px] text-[11px] font-medium text-[#CBD2BE]">지출</div><Money className="text-[14px] font-bold text-[#E7DCC5]">{won(summary.expenseTotal)}</Money></div>
            </div>
          </div>
        </div>

        {/* 지출 구성 */}
        <Card className="mb-4 px-[22px] py-5">
          <div className="mb-4 text-[15px] font-bold text-ink">지출 구성</div>
          {bars.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {bars.map((c) => {
                const over = (c.key === "rent" && (c.pctOfRevenue ?? 0) > 20) || (c.key === "labor" && (c.pctOfRevenue ?? 0) > 60);
                return (
                  <div key={c.key}>
                    <div className="mb-2 flex h-2 overflow-hidden rounded-[5px] bg-[#F4EFE6]">
                      <div style={{ width: `${Math.min(100, c.pctOfRevenue ?? 0)}%`, background: CAT_COLOR[c.key] }} />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: CAT_COLOR[c.key] }} />
                      <span className="flex-1 text-[13px] font-semibold text-ink">{c.label}</span>
                      {over ? <span style={pillStyle}>권장 초과</span> : null}
                      {c.pctOfRevenue != null ? <span className={`text-[12.5px] font-bold ${over ? "text-[#C67352]" : "text-[#766D60]"}`}>{c.pctOfRevenue}%</span> : null}
                      <Money className="min-w-[80px] text-right text-[12px] font-medium text-[#9A917F]">{won(c.amount)}</Money>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-[13px] font-medium text-[#A89F92]">이번 달 지출이 없어요</div>
          )}
        </Card>

        {/* 지출 장부 (client) */}
        <ExpenseLedger items={exp.items} staff={staffPicks} />

        <div className="h-3" />
      </div>
    </>
  );
}

const pillStyle: React.CSSProperties = { font: "700 11px Pretendard", color: "#C67352", background: "#FBF3E9", padding: "3px 9px", borderRadius: 7, whiteSpace: "nowrap", display: "inline-block" };
