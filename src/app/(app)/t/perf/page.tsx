import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Icon } from "@/components/ui/icon";
import { trainerTabs } from "@/components/trainer/tabs";
import { getStudioOps } from "@/lib/data/groups/owner-ops";
import { sb } from "@/lib/data/db";
import { requireOwnerPage } from "@/lib/auth/guard";

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
  const t = await requireOwnerPage(); // 대표 전용 — 강사는 /t 로 리다이렉트
  const isOwner = true;
  // getStudioOps re-reads the (cached) trainer context internally; overlap it with the
  // unread-count query instead of stacking them.
  const [ops, chatUnread] = await Promise.all([
    getStudioOps(),
    chatUnreadFor(t.id),
  ]);

  const todoCount = (ops.pendingRequests > 0 ? 1 : 0) + (chatUnread > 0 ? 1 : 0);
  const deltaLabel =
    ops.revenueDeltaPct != null
      ? `전월 대비 ${ops.revenueDeltaPct >= 0 ? "+" : ""}${ops.revenueDeltaPct}%`
      : ops.paymentCount > 0
        ? `${ops.paymentCount}건`
        : "기록 없음";

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

        {/* 운영 지표 — 매출 / 활성 / 신규 / 만료 임박 */}
        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/t/revenue" className="tappable rounded-[16px] border border-ink/[0.07] bg-card p-4">
            <div className="text-[12px] font-medium text-muted2">이번 달 매출</div>
            <div className="serif mt-1.5 text-[20px] font-semibold leading-none text-ink">
              {won(ops.revenueThisMonth)}
            </div>
            <div
              className={`mt-1.5 text-[11.5px] font-medium ${
                ops.revenueDeltaPct != null && ops.revenueDeltaPct < 0 ? "text-terracotta" : "text-sage-deep"
              }`}
            >
              {deltaLabel}
            </div>
          </Link>

          <Link href="/t/members" className="tappable rounded-[16px] border border-ink/[0.07] bg-card p-4">
            <div className="text-[12px] font-medium text-muted2">활성 회원</div>
            <div className="serif mt-1.5 text-[22px] font-semibold leading-none text-ink">
              {ops.activeMembers}
              <span className="ml-0.5 text-[13px] font-medium text-muted2">명</span>
            </div>
            <div className="mt-1.5 text-[11.5px] font-medium text-muted2">전체 회원</div>
          </Link>

          <div className="rounded-[16px] border border-ink/[0.07] bg-card p-4">
            <div className="text-[12px] font-medium text-muted2">이번 달 신규</div>
            <div className="serif mt-1.5 text-[22px] font-semibold leading-none text-ink">
              {ops.newMembers}
              <span className="ml-0.5 text-[13px] font-medium text-muted2">명</span>
            </div>
            <div className="mt-1.5 text-[11.5px] font-medium text-muted2">신규 가입</div>
          </div>

          <Link href="/t/retention" className="tappable rounded-[16px] border border-ink/[0.07] bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted2">만료 임박</span>
              <Icon name="chevron-right" size={14} className="text-chevron" />
            </div>
            <div className="serif mt-1.5 text-[22px] font-semibold leading-none text-ink">
              {ops.expiringCount}
              <span className="ml-0.5 text-[13px] font-medium text-muted2">명</span>
            </div>
            <div
              className={`mt-1.5 text-[11.5px] font-medium ${
                ops.expiringCount > 0 ? "text-terracotta" : "text-muted2"
              }`}
            >
              {ops.expiringCount > 0 ? "재등록 챙기기" : "없음"}
            </div>
          </Link>
        </div>

        {/* 지금 챙길 일 */}
        <div className="mb-2 mt-5 px-0.5 text-[12px] font-semibold text-muted">
          지금 챙길 일{todoCount > 0 ? ` · ${todoCount}건` : ""}
        </div>
        {todoCount === 0 ? (
          <div className="rounded-[16px] border border-ink/[0.07] bg-card px-4 py-[15px] text-[13px] font-medium text-muted">
            지금은 챙길 일이 없어요 👍
          </div>
        ) : (
          <>
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
          </>
        )}

        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner, chatUnread })} liveChat />
    </div>
  );
}
