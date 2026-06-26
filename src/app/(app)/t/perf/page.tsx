import type { ReactNode } from "react";
import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Icon, type IconName } from "@/components/ui/icon";
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

/** Read-only KPI tile (display only — actions live in the lists below). */
function Metric({ label, value, sub, subTone }: { label: string; value: ReactNode; sub: string; subTone?: "warn" }) {
  return (
    <div className="rounded-[16px] border border-ink/[0.07] bg-card p-4">
      <div className="text-[12px] font-medium text-muted2">{label}</div>
      <div className="serif mt-1.5 text-[22px] font-semibold leading-none text-ink">{value}</div>
      <div className={`mt-1.5 text-[11.5px] font-medium ${subTone === "warn" ? "text-terracotta" : "text-muted2"}`}>{sub}</div>
    </div>
  );
}

/** Tappable action row used by both 오늘 할 일 and 빠른 작업. */
function ActionRow({ href, icon, title, sub, tone }: { href: string; icon: IconName; title: string; sub: string; tone?: "warn" }) {
  return (
    <Link
      href={href}
      className="tappable mb-2.5 flex items-center gap-3 rounded-[16px] border border-ink/[0.07] bg-card px-4 py-[15px]"
    >
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
          tone === "warn" ? "bg-warm-banner text-terracotta" : "bg-chip-soft text-sage-deep"
        }`}
      >
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-[12px] text-muted2">{sub}</div>
      </div>
      <Icon name="chevron-right" size={15} className="flex-none text-chevron" />
    </Link>
  );
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

  const todoCount =
    (ops.pendingRequests > 0 ? 1 : 0) + (chatUnread > 0 ? 1 : 0) + (ops.expiringCount > 0 ? 1 : 0);
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

        {/* 운영 지표 (표시 전용) — 매출 / 활성 / 신규 / 만료 임박 */}
        <div className="grid grid-cols-2 gap-2.5">
          <Metric
            label="이번 달 매출"
            value={<span className="text-[20px]">{won(ops.revenueThisMonth)}</span>}
            sub={deltaLabel}
            subTone={ops.revenueDeltaPct != null && ops.revenueDeltaPct < 0 ? "warn" : undefined}
          />
          <Metric
            label="활성 회원"
            value={<>{ops.activeMembers}<span className="ml-0.5 text-[13px] font-medium text-muted2">명</span></>}
            sub="회원권 보유"
          />
          <Metric
            label="이번 달 신규"
            value={<>{ops.newMembers}<span className="ml-0.5 text-[13px] font-medium text-muted2">명</span></>}
            sub="신규 가입"
          />
          <Metric
            label="만료 임박"
            value={<>{ops.expiringCount}<span className="ml-0.5 text-[13px] font-medium text-muted2">명</span></>}
            sub={ops.expiringCount > 0 ? "재등록 대상" : "없음"}
            subTone={ops.expiringCount > 0 ? "warn" : undefined}
          />
        </div>

        {/* 오늘 할 일 — 항상 표시, 없으면 빈 상태 */}
        <div className="mb-2 mt-6 px-0.5 text-[12px] font-semibold text-muted">
          오늘 할 일{todoCount > 0 ? ` · ${todoCount}건` : ""}
        </div>
        {todoCount > 0 ? (
          <>
            {ops.expiringCount > 0 ? (
              <ActionRow
                href="/t/retention"
                icon="refresh"
                title="만료 임박 재등록"
                sub={`${ops.expiringCount}명 · 재등록 안내`}
                tone="warn"
              />
            ) : null}
            {ops.pendingRequests > 0 ? (
              <ActionRow
                href="/t/inbox"
                icon="clock"
                title="처리 대기 요청"
                sub={`일정 변경·취소 ${ops.pendingRequests}건`}
              />
            ) : null}
            {chatUnread > 0 ? (
              <ActionRow href="/t/chat" icon="message" title="답장 안 한 채팅" sub={`미답 ${chatUnread}건`} />
            ) : null}
          </>
        ) : (
          <div className="mb-2.5 flex items-center gap-3 rounded-[16px] border border-ink/[0.07] bg-card px-4 py-[15px]">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-sage-banner text-sage-deep">
              <Icon name="check-bold" size={18} />
            </span>
            <div className="text-[13.5px] font-medium text-muted">오늘은 처리할 일이 없어요</div>
          </div>
        )}

        {/* 빠른 작업 */}
        <div className="mb-2 mt-5 px-0.5 text-[12px] font-semibold text-muted">빠른 작업</div>
        <ActionRow href="/t/members/register" icon="person-plus" title="회원 등록" sub="신규 회원 + 회원권 발급" />
        <ActionRow href="/t/members" icon="persons" title="회원 관리" sub="회원 조회·상세" />
        <ActionRow href="/t/revenue" icon="coins" title="매출 장부" sub="결제 내역·월 합계" />

        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner, chatUnread })} liveChat />
    </div>
  );
}
