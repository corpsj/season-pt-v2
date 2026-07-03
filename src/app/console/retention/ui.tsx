"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, PBtn, DPill, won } from "@/components/console/ui";
import { markGuided, markAllGuided } from "@/lib/data/groups/perf-retention-actions";
import type { RetentionView } from "@/lib/types";

export default function RetentionConsole({ view }: { view: RetentionView }) {
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  // 낙관적 표시 — 서버 액션은 startTransition으로 뒤에서 처리하고 화면은 즉시 갱신한다(모바일 재등록과 동일).
  const [guided, setGuided] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(view.items.map((i) => [i.memberId, i.guided])),
  );
  const pendingCount = view.items.filter((i) => !guided[i.memberId]).length;

  function markOne(memberId: string) {
    setGuided((g) => ({ ...g, [memberId]: true }));
    toast("안내 완료로 표시했어요");
    startTransition(async () => {
      await markGuided(memberId);
      router.refresh();
    });
  }

  async function markAll() {
    if (pendingCount === 0) return;
    if (!(await confirm({ title: `${pendingCount}명을 일괄 표시할까요?`, description: "아직 안내하지 않은 회원을 모두 '안내 완료'로 표시해요. (알림톡 연동 전이라 실제 발송은 되지 않아요.)", confirmLabel: "표시" }))) return;
    setGuided((g) => {
      const next = { ...g };
      for (const i of view.items) next[i.memberId] = true;
      return next;
    });
    toast("일괄 표시했어요");
    startTransition(async () => {
      await markAllGuided();
      router.refresh();
    });
  }

  return (
    <>
      {/* summary strip */}
      <div className="mb-[18px] flex items-stretch gap-3">
        <Card className="flex flex-1 items-center gap-3.5 px-[22px] py-[18px]">
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-[#EDF4E3]">
            <Icon name="megaphone-fill" size={22} className="text-sage-deep" />
          </span>
          <div>
            <div className="text-[12.5px] font-medium text-[#9A917F]">14일 이내 만료 임박</div>
            <div className="mt-0.5">
              <span className="serif text-[24px] font-semibold text-ink">{view.expiringCount}</span>
              <span className="text-[12px] font-medium text-[#9A917F]">명 · 예상 재등록 매출 </span>
              <span className="text-[15px] font-bold text-ink">{won(view.expectedRevenue)}</span>
            </div>
          </div>
        </Card>
        <PBtn icon="megaphone" className="flex-none !px-5" disabled={pendingCount === 0} onClick={markAll}>안내 전 {pendingCount}명 일괄 표시</PBtn>
      </div>

      {/* list */}
      <Card className="overflow-hidden">
        <div className="border-b border-[rgba(75,59,46,0.07)] px-[22px] py-[13px] text-[11.5px] font-semibold tracking-[0.02em] text-[#9A917F]">만료 임박 회원</div>
        {view.items.length > 0 ? (
          view.items.map((item) => {
            const isGuided = guided[item.memberId];
            return (
              <div key={item.memberId} className="flex items-center gap-3.5 border-b border-[rgba(75,59,46,0.05)] px-[22px] py-3.5 last:border-b-0">
                <Avatar initial={item.initial} tone={item.avatarTone} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-bold text-ink">{item.name}</span>
                    <DPill dDay={item.dDay} />
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium text-[#9A917F]">잔여 {item.remaining}회 · {isGuided ? "안내 완료" : "안내 전"}</div>
                </div>
                {isGuided ? (
                  <span className="flex-none rounded-[9px] bg-[#EDF4E3] px-3 py-[7px] text-[12.5px] font-bold text-sage-deep">안내 완료</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => markOne(item.memberId)}
                    className="inline-flex flex-none items-center gap-1.5 rounded-[10px] bg-sage px-3.5 py-[8px] text-[12.5px] font-bold text-white transition hover:brightness-105"
                  >
                    <Icon name="message-fill" size={14} />
                    안내함
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center text-[13.5px] font-medium text-[#A89F92]">만료 임박 회원이 없어요</div>
        )}
      </Card>
    </>
  );
}
