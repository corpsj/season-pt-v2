import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Topbar } from "@/components/console/Topbar";
import { Card } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { won } from "@/components/console/ui";
import { requireOwnerPage } from "@/lib/auth/guard";
import { getRevenue } from "@/lib/data/groups/owner-ops";
import { getRetention } from "@/lib/data/groups/perf-retention";
import { getMembersAll } from "@/lib/data/groups/trainer-home";
import { RevenueLedger, PayRecordButton, ExportButton } from "./ui";

const METHOD_COLOR: Record<string, string> = { 카드: "#768c6a", 현금: "#b89a5e", 계좌이체: "#6e8aa0", 기타: "#a89a80" };

export default async function ConsoleRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  await requireOwnerPage(); // 매출 장부는 대표 전용 — 레이아웃 렌더링에만 기대지 않는다(감사 #7)
  const sp = await searchParams;
  const i = Math.max(0, Number(sp.i ?? "0") || 0);
  const [rev, retention, membersAll] = await Promise.all([getRevenue(), getRetention(), getMembersAll()]);

  const months = rev.months;
  const sel = months[i] ?? months[0] ?? { key: "", label: "기록 없음", total: 0, count: 0, items: [] };
  const older = months[i + 1]; // 더 과거(데이터 있는) 달 — 이전달 네비게이션 활성 여부용
  // '데이터 있는 직전 달'이 아니라 실제 직전 달력 월과 비교(없으면 0) — 대시보드 델타와 동일 기준.
  const prevKey = (() => {
    const [y, m] = sel.key.split("-").map(Number);
    if (!y || !m) return "";
    return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  })();
  const olderTotal = prevKey ? months.find((mm) => mm.key === prevKey)?.total ?? 0 : 0;
  const delta = olderTotal > 0 ? Math.round(((sel.total - olderTotal) / olderTotal) * 100) : null;

  const gross = sel.items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const refundSum = sel.items.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0);

  // payment-method breakdown (positive amounts only)
  const methodAgg = new Map<string, number>();
  for (const it of sel.items) if (it.amount > 0) methodAgg.set(it.methodLabel, (methodAgg.get(it.methodLabel) ?? 0) + it.amount);
  const methodTotal = [...methodAgg.values()].reduce((s, v) => s + v, 0) || 1;
  const methods = [...methodAgg.entries()]
    .map(([label, amount]) => ({ label, amount, pct: Math.round((amount / methodTotal) * 100), color: METHOD_COLOR[label] ?? "#a89a80" }))
    .sort((a, b) => b.amount - a.amount);

  // 6-month trend, chronological
  const trend = months.slice(0, 6).reverse();
  const maxTrend = Math.max(1, ...trend.map((m) => m.total));

  const memberPicks = membersAll.view.items.map((m) => ({ id: m.id, name: m.name, initial: m.initial, avatarTone: m.avatarTone }));

  return (
    <>
      <Topbar title="매출 현황" sub={`${sel.label} · 총 ${rev.totalCount}건 누적`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <div className="mx-auto max-w-[980px]">
        {/* toolbar */}
        <div className="mb-[18px] flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-[11px] border border-[rgba(75,59,46,0.1)] bg-white px-[15px] py-[9px]">
            <Link href={`/console/revenue?i=${i + 1}`} aria-disabled={!older} className={`${older ? "text-[#9A917F]" : "pointer-events-none text-[#D6CFC2]"}`}><Icon name="chevron-left" size={16} /></Link>
            <span className="text-[14px] font-bold text-ink">{sel.label}</span>
            <Link href={`/console/revenue?i=${Math.max(0, i - 1)}`} aria-disabled={i === 0} className={`${i > 0 ? "text-[#9A917F]" : "pointer-events-none text-[#D6CFC2]"}`}><Icon name="chevron-right" size={16} /></Link>
          </div>
          <ExportButton monthLabel={sel.label} items={sel.items} />
          <PayRecordButton members={memberPicks} />
        </div>

        {/* hero + expected */}
        <div className="mb-4 grid grid-cols-[1.5fr_1fr] gap-4">
          <div className="flex items-end justify-between gap-5 rounded-[18px] px-6 py-[22px]" style={{ background: "#768C6A", boxShadow: "0 14px 30px -22px rgba(75,59,46,0.5)" }}>
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-[#D7DCCF]">{sel.label.replace(/^\d+년 /, "")} 순매출</div>
              <Money className="serif whitespace-nowrap text-[38px] font-semibold leading-[0.9] text-surface">{won(sel.total)}</Money>
              {delta != null ? (
                <div className="mt-3.5 flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-[3px] rounded-[7px] bg-[#E7DCC5] px-[9px] py-1 text-[12px] font-bold text-[#26231E]"><Icon name="arrow-up-right" size={13} />{delta >= 0 ? "+" : ""}{delta}%</span>
                  <span className="text-[12px] font-medium text-[#D7DCCF]">전월 대비</span>
                </div>
              ) : null}
              <div className="mt-4 flex gap-5">
                <div><div className="mb-[3px] text-[11px] font-medium text-[#CBD2BE]">총 매출</div><Money className="text-[14px] font-bold text-surface">{won(gross)}</Money></div>
                <div><div className="mb-[3px] text-[11px] font-medium text-[#CBD2BE]">환불</div><Money className="text-[14px] font-bold text-[#E7DCC5]">{won(refundSum)}</Money></div>
              </div>
            </div>
            {/* trend bars */}
            <div className="flex h-[104px] flex-none items-end gap-[7px]">
              {trend.map((m) => (
                <div key={m.key} className="flex h-full flex-col items-center justify-end gap-1.5">
                  <div className="w-[17px] rounded-t-[5px]" style={{ height: `${Math.max(4, (m.total / maxTrend) * 88)}px`, background: m.key === sel.key ? "#E7DCC5" : "rgba(231,220,197,0.4)" }} />
                  <div className="text-[9px] font-semibold text-[#CBD2BE]">{Number(m.key.slice(5, 7))}월</div>
                </div>
              ))}
            </div>
          </div>

          <Card className="flex flex-col px-[22px] py-5" style={{ borderColor: "rgba(184,154,94,0.28)" }}>
            <div className="mb-[11px] flex items-center gap-2">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#F4EEE3]"><Icon name="refresh" size={16} style={{ color: "#8A6F3E" }} /></span>
              <span className="text-[13.5px] font-bold text-ink">예상 추가 매출</span>
            </div>
            <Money className="serif text-[30px] font-semibold leading-[0.9]" >{won(retention.expectedRevenue)}</Money>
            <div className="mt-2 flex-1 text-[12px] font-medium text-[#9A917F]">만료 임박 {retention.expiringCount}명이 재등록하면 더해지는 금액이에요</div>
            <Link href="/console/members" className="mt-3.5 inline-flex items-center justify-center gap-1.5 rounded-[12px] border-[1.4px] border-[rgba(107,120,94,0.4)] bg-white py-[11px] text-[13.5px] font-semibold text-[#5B6452] transition hover:bg-[#F4F0E8]"><Icon name="person" size={15} />재등록 대상 보기</Link>
          </Card>
        </div>

        {/* methods */}
        <Card className="mb-4 px-[22px] py-5">
          <div className="mb-4 text-[15px] font-bold text-ink">결제 수단</div>
          {methods.length > 0 ? (
            <>
              <div className="mb-4 flex h-3 overflow-hidden rounded-[6px]">
                {methods.map((m) => <div key={m.label} style={{ width: `${m.pct}%`, background: m.color }} />)}
              </div>
              <div className="flex flex-col gap-[11px]">
                {methods.map((m) => (
                  <div key={m.label} className="flex items-center gap-2.5">
                    <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: m.color }} />
                    <span className="flex-1 text-[13px] font-semibold text-ink">{m.label}</span>
                    <span className="text-[12.5px] font-bold text-[#766D60]">{m.pct}%</span>
                    <Money className="min-w-[80px] text-right text-[12px] font-medium text-[#9A917F]">{won(m.amount)}</Money>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-[13px] font-medium text-[#A89F92]">이번 달 결제 내역이 없어요</div>
          )}
        </Card>

        {/* ledger */}
        <RevenueLedger items={sel.items} />
        </div>
      </div>
    </>
  );
}
