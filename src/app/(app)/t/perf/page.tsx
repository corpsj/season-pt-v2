import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/StatCard";
import { BarChart } from "@/components/ui/BarChart";
import { Icon } from "@/components/ui/icon";
import { trainerTabs } from "@/components/trainer/tabs";
import { getStudioOverview } from "@/lib/data/groups/owner-ops";
import { sb, getTrainerContext } from "@/lib/data/db";

/** Unread chat count for this trainer (for the tab badge). */
async function chatUnreadFor(trainerId: string): Promise<number> {
  const { data } = await sb
    .from("chat_threads")
    .select("id")
    .eq("trainer_id", trainerId);
  const threadIds = (data ?? []).map((t) => t.id);
  if (threadIds.length === 0) return 0;
  const { count } = await sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threadIds)
    .eq("sender_type", "member")
    .eq("read_by_trainer", false);
  return count ?? 0;
}

export default async function TrainerOpsPage() {
  const t = await getTrainerContext();
  const isOwner = t?.role === "owner";
  const ov = await getStudioOverview();
  const chatUnread = t ? await chatUnreadFor(t.id) : 0;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">{ov.monthLabel}</div>
            <div className="text-[21px] font-bold text-ink">운영 현황</div>
          </div>
          <Link
            href="/t/settings"
            aria-label="설정"
            className="tappable flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
          >
            <Icon name="setting" size={20} />
          </Link>
        </div>

        {/* hero — active members (people, not money) */}
        <div className="mb-2.5 rounded-[18px] bg-sage p-5">
          <div className="text-[12px] text-surface/85">활동 중인 회원</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="serif text-[36px] leading-none text-surface">
              {ov.activeMembers.toLocaleString()}명
            </span>
            {ov.newThisMonth > 0 ? (
              <span className="pb-0.5 text-[13px] font-semibold text-[#CDE0CF]">
                이번 달 신규 {ov.newThisMonth}명
              </span>
            ) : null}
          </div>
        </div>

        {/* three stat cards */}
        <div className="mb-2.5 flex gap-2.5">
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={ov.weekClasses} label="이번 주 수업" />
          </Card>
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={`${ov.attendRate}%`} label="출석률" color="text-sage-deep" />
          </Card>
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={`${ov.trainerCount}명`} label="트레이너" color="text-sage-soft" />
          </Card>
        </div>

        {/* weekly chart */}
        <Card className="mb-2.5 p-4">
          <div className="mb-3.5 flex items-center justify-between">
            <span className="text-[13.5px] font-bold text-ink">주간 수업</span>
            <span className="text-[12px] font-medium text-muted">{ov.weekClasses}타임</span>
          </div>
          <BarChart bars={ov.weeklyBars} />
        </Card>

        {/* retention banner — people-centric, no ₩ */}
        {ov.expiringCount > 0 ? (
          <Link
            href="/t/retention"
            className="tappable flex items-center gap-2.5 rounded-[16px] border border-terracotta/[0.18] bg-warm-banner px-4 py-[15px]"
          >
            <Icon name="refresh" size={20} className="text-terracotta" />
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-terracotta-deep">재등록 관리가 필요한 회원</div>
              <div className="mt-0.5 text-[12px] text-terracotta-text">만료 임박 {ov.expiringCount}명</div>
            </div>
            <Icon name="chevron-right" size={16} className="text-terracotta" />
          </Link>
        ) : null}

        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner, chatUnread })} liveChat />
    </div>
  );
}
