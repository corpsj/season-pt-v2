import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Icon } from "@/components/ui/icon";
import { trainerTabs } from "@/components/trainer/tabs";
import { getStudioOps } from "@/lib/data/groups/owner-ops";
import { sb, getTrainerContext } from "@/lib/data/db";

/** ₩ with thousands separators. */
function won(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}

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
  // getStudioOps re-reads the (cached) trainer context internally; overlap it with the
  // unread-count query instead of stacking them.
  const [ops, chatUnread] = await Promise.all([
    getStudioOps(),
    t ? chatUnreadFor(t.id) : Promise.resolve(0),
  ]);

  const todoCount =
    (ops.expiringCount > 0 ? 1 : 0) +
    (ops.pendingRequests > 0 ? 1 : 0) +
    (chatUnread > 0 ? 1 : 0);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">{ops.monthLabel}</div>
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

        {/* hero — 재등록으로 들어올 매출 (실데이터: membership.price). 탭하면 재등록 관리로. */}
        {ops.expiringCount > 0 ? (
          <Link href="/t/retention" className="tappable mb-2.5 block rounded-[18px] bg-sage p-5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-surface/85">재등록하면 들어올 매출</span>
              <Icon name="chevron-right" size={16} className="text-surface/70" />
            </div>
            <div className="mt-2">
              <span className="serif text-[34px] leading-none text-surface">
                {won(ops.expectedRevenue)}
              </span>
            </div>
            <div className="mt-2 text-[12.5px] font-medium text-[#CDE0CF]">
              만료 임박 {ops.expiringCount}명 · 지금 챙기세요
            </div>
          </Link>
        ) : (
          <div className="mb-2.5 rounded-[18px] bg-sage p-5">
            <div className="text-[12px] text-surface/85">재등록 관리</div>
            <div className="mt-2 text-[18px] font-semibold text-surface">
              만료 임박 회원이 없어요
            </div>
            <div className="mt-1.5 text-[12.5px] font-medium text-[#CDE0CF]">
              지금은 챙길 재등록이 없습니다
            </div>
          </div>
        )}

        {/* 챙길 일 섹션 라벨 */}
        {todoCount > 0 ? (
          <div className="mb-2 mt-1 px-0.5 text-[12px] font-semibold text-muted">
            지금 챙길 일 · {todoCount}건
          </div>
        ) : null}

        {/* action — 처리 대기 요청 */}
        {ops.pendingRequests > 0 ? (
          <Link
            href="/t/inbox"
            className="tappable mb-2.5 flex items-center gap-3 rounded-[16px] border border-ink/[0.07] bg-card px-4 py-[15px]"
          >
            <Icon name="clock" size={20} className="flex-none text-sage-deep" />
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold text-ink">처리 대기 요청</div>
              <div className="mt-0.5 text-[12px] text-muted2">일정 변경·취소 {ops.pendingRequests}건</div>
            </div>
            <Icon name="chevron-right" size={15} className="text-chevron" />
          </Link>
        ) : null}

        {/* action — 미답 채팅 */}
        {chatUnread > 0 ? (
          <Link
            href="/t/chat"
            className="tappable mb-2.5 flex items-center gap-3 rounded-[16px] border border-ink/[0.07] bg-card px-4 py-[15px]"
          >
            <Icon name="message" size={20} className="flex-none text-sage-deep" />
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold text-ink">답장 안 한 채팅</div>
              <div className="mt-0.5 text-[12px] text-muted2">미답 {chatUnread}건</div>
            </div>
            <Icon name="chevron-right" size={15} className="text-chevron" />
          </Link>
        ) : null}

        {/* 이번 달 요약 — 신규 회원, (결제가 찍혔으면) 매출 */}
        <div className="mt-1 flex items-center gap-2 px-1 text-[12.5px] text-muted2">
          <Icon name="person-plus" size={15} className="text-sage-soft" />
          <span>
            이번 달 신규 {ops.newMembers}명
            {ops.paymentCount > 0 ? ` · 매출 ${won(ops.revenueThisMonth)}` : ""}
          </span>
        </div>

        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner, chatUnread })} liveChat />
    </div>
  );
}
