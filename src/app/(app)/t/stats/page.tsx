import type { ReactNode } from "react";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Icon } from "@/components/ui/icon";
import { trainerTabs } from "@/components/trainer/tabs";
import { getMe, getChatUnread, getMyStats } from "@/lib/data/groups/trainer-home";
import { getMySettlementPreview } from "@/lib/data/groups/settlement";

function won(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

/** Read-only KPI tile — /t/perf Metric과 동일 스타일. */
function Metric({ label, value, sub, subTone }: { label: string; value: ReactNode; sub: string; subTone?: "warn" }) {
  return (
    <div className="rounded-[16px] border border-ink/[0.07] bg-card p-4">
      <div className="text-[12px] font-medium text-muted2">{label}</div>
      <div className="serif mt-1.5 text-[22px] font-semibold leading-none text-ink">{value}</div>
      <div className={`mt-1.5 text-[11.5px] font-medium ${subTone === "warn" ? "text-terracotta" : "text-muted2"}`}>{sub}</div>
    </div>
  );
}

const CNT = (n: number) => (
  <>
    {n}
    <span className="ml-0.5 text-[13px] font-medium text-muted2">회</span>
  </>
);

/** 강사 본인 수업 현황 — 이번 달/주 수업 횟수와 상태별 집계. 로그인 강사 스코프(대표가 봐도 본인 것). */
export default async function TrainerStatsPage() {
  const [me, chatUnread, stats, preview] = await Promise.all([getMe(), getChatUnread(), getMyStats(), getMySettlementPreview()]);
  const donePct = stats.monthTotal > 0 ? Math.round((stats.attended / stats.monthTotal) * 100) : 0;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5">
          <div className="text-[13px] font-medium text-muted">{stats.monthLabel} · {me.name}</div>
          <div className="text-[21px] font-bold text-ink">내 수업 현황</div>
        </div>

        {/* 이번 달 수업 — 전폭 강조 스트립 */}
        <div className="mb-2.5 rounded-[16px] border border-ink/[0.07] bg-sage-banner p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-muted">이번 달 수업</span>
            <span className="text-[11.5px] font-semibold text-muted2">완료 {donePct}%</span>
          </div>
          <div className="serif mt-1.5 text-[26px] font-bold leading-none text-ink">
            {stats.monthTotal}<span className="ml-1 text-[15px] font-semibold text-muted2">회</span>
          </div>
          <div className="mt-2 text-[11.5px] font-medium text-muted2">
            완료 {stats.attended}회 · 예정 {stats.upcoming}회
          </div>
        </div>

        {/* 이번 달 예상 수입 — 확정 전 예상액(본인 스코프) */}
        {preview ? (
          <div className="mb-2.5 rounded-[16px] border border-ink/[0.07] bg-card p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-muted">이번 달 예상 수입</span>
              <span className="text-[11.5px] font-semibold text-muted2">확정 전</span>
            </div>
            {preview.payout > 0 ? (
              <>
                <div className="serif mt-1.5 text-[26px] font-bold leading-none text-ink">{won(preview.payout)}</div>
                <div className="mt-2 text-[11.5px] font-medium text-muted2">
                  1:1 {preview.count1on1}회 · 2:1 {preview.count2on1}회 · 노쇼·취소 미포함
                </div>
              </>
            ) : (
              <div className="mt-1.5 text-[13px] font-medium text-muted2">단가는 대표가 설정해요</div>
            )}
          </div>
        ) : null}

        {/* 지표 그리드 */}
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="이번 주 수업" value={CNT(stats.weekTotal)} sub="취소 제외" />
          <Metric
            label="담당 회원"
            value={<>{stats.memberCount}<span className="ml-0.5 text-[13px] font-medium text-muted2">명</span></>}
            sub="회원 탭에서 상세 확인"
          />
          <Metric label="완료한 수업" value={CNT(stats.attended)} sub="이번 달 출석 처리" />
          <Metric
            label="노쇼"
            value={CNT(stats.noshow)}
            sub={stats.noshow > 0 ? "이번 달 미출석" : "없음"}
            subTone={stats.noshow > 0 ? "warn" : undefined}
          />
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[13px] bg-sage-banner px-4 py-3">
          <Icon name="circle-info" size={16} className="mt-px flex-none text-sage-deep" />
          <span className="text-[12px] font-medium leading-relaxed text-muted2">
            수업 횟수는 이번 달 기준이고 취소된 수업은 포함되지 않아요.
          </span>
        </div>
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />
    </div>
  );
}
