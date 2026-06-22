"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import type { RetentionView } from "@/lib/types";
import { markGuided, markAllGuided } from "@/lib/data/groups/perf-retention-actions";

/** 4_200_000 → "₩4.2M" (compact summary form per DESIGN_SPEC §C-13). */
function compactWon(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `₩${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `₩${n.toLocaleString()}`;
}

export default function RetentionUI({ view }: { view: RetentionView }) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [guided, setGuided] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(view.items.map((i) => [i.memberId, i.guided])),
  );

  const pendingCount = view.items.filter((i) => !guided[i.memberId]).length;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">재등록 관리</span>
        </div>

        {/* summary card */}
        <Card className="mb-4 flex items-center gap-3.5 bg-sage p-4 text-surface">
          <Icon name="megaphone-fill" size={24} className="flex-none" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">
              이번 주 만료 {view.expiringCount}명
            </div>
            <div className="serif mt-0.5 text-[20px] font-bold">
              예상 재등록 매출 {compactWon(view.expectedRevenue)}
            </div>
          </div>
        </Card>

        {/* list */}
        <div className="flex flex-col gap-2.5">
          {view.items.map((item) => {
            const isGuided = guided[item.memberId];
            return (
              <Card key={item.memberId} className="flex items-center gap-3 px-[15px] py-[13px]">
                <Avatar initial={item.initial} tone={item.avatarTone} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[14.5px] font-bold text-ink">{item.name}</span>
                    <span className="flex-none text-[12px] font-medium text-muted">
                      잔여 {item.remaining}회
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium text-muted">
                    D-{item.dDay} · {isGuided ? "안내 완료" : "안내 전"}
                  </div>
                </div>
                {isGuided ? (
                  <button
                    type="button"
                    onClick={() => toast("상담 메모를 열었어요")}
                    className="tappable flex-none rounded-[10px] border-[1.5px] border-sage-deep/45 px-[13px] py-[7px] text-[12.5px] font-bold text-sage-deep hover:bg-sage/[0.07]"
                  >
                    상담
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setGuided((g) => ({ ...g, [item.memberId]: true }));
                      toast("알림톡을 보냈어요");
                      startTransition(async () => {
                        await markGuided(item.memberId);
                        router.refresh();
                      });
                    }}
                    className="tappable flex flex-none items-center gap-1.5 rounded-[10px] bg-sage px-[13px] py-[7px] text-[12.5px] font-bold text-surface hover:brightness-105"
                  >
                    <Icon name="message-fill" size={14} />
                    알림톡
                  </button>
                )}
              </Card>
            );
          })}
        </div>

        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton
          icon="megaphone"
          onClick={() => {
            setGuided((g) => {
              const next = { ...g };
              for (const i of view.items) next[i.memberId] = true;
              return next;
            });
            toast("일괄 발송했어요");
            startTransition(async () => {
              await markAllGuided();
              router.refresh();
            });
          }}
        >
          안내 전 {pendingCount}명 일괄 발송
        </PrimaryButton>
      </Footer>
    </div>
  );
}
