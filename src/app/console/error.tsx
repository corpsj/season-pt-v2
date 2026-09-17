"use client";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { Card, PBtn } from "@/components/console/ui";

/** 콘솔 섹션 공용 에러 바운더리 — 사이드바는 유지되고 본문 영역만 대체한다. */
export default function ConsoleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[console-error]", error);
  }, [error]);

  return (
    <div className="flex h-full flex-1 items-center justify-center p-10">
      <Card className="flex w-[400px] flex-col items-center p-9 text-center">
        <div className="mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-chip-soft">
          <Icon name="triangle-exclamation" size={26} className="text-placeholder" />
        </div>
        <div className="text-[16px] font-bold text-ink">화면을 불러오지 못했어요</div>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">
          일시적인 문제일 수 있어요. 잠시 후 다시 시도해 주세요.
        </p>
        {error.digest ? (
          <p className="mt-1 text-[11px] text-placeholder">오류 코드 {error.digest}</p>
        ) : null}
        <PBtn icon="refresh" onClick={() => unstable_retry()} className="mt-5">
          다시 시도
        </PBtn>
      </Card>
    </div>
  );
}
