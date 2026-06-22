import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/StatCard";
import { BarChart } from "@/components/ui/BarChart";
import { Icon } from "@/components/ui/icon";
import { getPerf, getMe, getChatUnread } from "@/lib/data";
import { trainerTabs } from "@/components/trainer/tabs";

export default function TrainerPerfPage() {
  const me = getMe();
  const perf = getPerf();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">{perf.monthLabel}</div>
            <div className="text-[21px] font-bold text-ink">내 실적</div>
          </div>
          <Link
            href="/t/settings"
            aria-label="설정"
            className="tappable flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
          >
            <Icon name="setting" size={20} />
          </Link>
        </div>

        {/* revenue card */}
        <div className="mb-2.5 rounded-[18px] bg-sage p-5">
          <div className="text-[12px] text-surface/85">이번 달 매출 기여</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="serif text-[36px] leading-none text-surface">
              ₩{perf.revenue.toLocaleString()}
            </span>
            <span className="flex items-center gap-0.5 pb-0.5 text-[13px] font-semibold text-[#CDE0CF]">
              <Icon name="arrow-up-right" size={15} />+{perf.revenueDelta}%
            </span>
          </div>
        </div>

        {/* three stat cards */}
        <div className="mb-2.5 flex gap-2.5">
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={perf.classCount} label="수업수" />
          </Card>
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={perf.memberCount} label="담당회원" color="text-sage-soft" />
          </Card>
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={`${perf.attendRate}%`} label="출석률" color="text-sage-deep" />
          </Card>
        </div>

        {/* weekly chart */}
        <Card className="mb-2.5 p-4">
          <div className="mb-3.5 flex items-center justify-between">
            <span className="text-[13.5px] font-bold text-ink">주간 수업</span>
            <span className="text-[12px] font-medium text-muted">21타임</span>
          </div>
          <BarChart bars={perf.weeklyBars} />
        </Card>

        {/* retention banner */}
        <Link
          href="/t/retention"
          className="tappable flex items-center gap-2.5 rounded-[16px] border border-terracotta/[0.18] bg-warm-banner px-4 py-[15px]"
        >
          <Icon name="refresh" size={20} className="text-terracotta" />
          <div className="flex-1">
            <div className="text-[13.5px] font-bold text-terracotta-deep">재등록 전환 관리</div>
            <div className="mt-0.5 text-[12px] text-terracotta-text">
              만료 임박 {perf.expiringCount}명 · 예상 ₩4.2M
            </div>
          </div>
          <Icon name="chevron-right" size={16} className="text-terracotta" />
        </Link>

        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread: getChatUnread() })} />
    </div>
  );
}
