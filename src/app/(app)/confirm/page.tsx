"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { Card } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { getConfirm } from "@/lib/data";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const to = searchParams.get("to") || "/t";
  const view = getConfirm();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="pt-pop flex h-[88px] w-[88px] items-center justify-center rounded-full bg-sage shadow-success">
            <Icon name="check-bold" size={40} className="text-surface" />
          </div>

          <h1 className="mt-6 text-[23px] font-bold tracking-[-0.01em] text-ink">
            일정이 변경되었어요
          </h1>
          <p className="mt-2.5 max-w-[260px] text-[14px] leading-[1.6] text-muted2">
            두 분 모두에게 알림을 보냈어요. 캘린더에 자동으로 반영됐어요.
          </p>

          <Card className="mt-7 w-full p-4">
            <div className="flex items-center justify-center gap-2.5">
              <div className="text-center">
                <div className="text-[11px] font-semibold text-muted">변경 전</div>
                <div className="mt-1 text-[13px] font-semibold text-muted6 line-through">
                  {view.before}
                </div>
              </div>
              <Icon name="chevron-right" size={16} className="flex-none text-chevron" />
              <div className="text-center">
                <div className="text-[11px] font-semibold text-sage-deep">변경 후</div>
                <div className="mt-1 text-[13px] font-bold text-ink">{view.after}</div>
              </div>
            </div>
          </Card>

          <Banner tone="positive" icon="ticket-fill" className="mt-3.5 w-full">
            변경은 차감 없이 잔여 {view.remainingKept}회가 유지돼요.
          </Banner>
        </div>
      </Body>

      <Footer className="flex flex-col gap-3">
        <OutlineButton href={to}>캘린더에서 보기</OutlineButton>
        <PrimaryButton href={to}>확인</PrimaryButton>
      </Footer>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={<div className="scr flex min-h-0 flex-1 flex-col" />}
    >
      <ConfirmContent />
    </Suspense>
  );
}
