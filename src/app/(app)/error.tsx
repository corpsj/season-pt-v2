"use client";
import { useEffect } from "react";
import { Body, Footer } from "@/components/shell/Body";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";

/** 모바일(회원·강사) 전 화면 공용 에러 바운더리 — Frame 셸 안에서 렌더된다. */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="form" className="justify-center">
        <EmptyState
          icon="triangle-exclamation"
          title="화면을 불러오지 못했어요"
          desc="일시적인 문제일 수 있어요. 잠시 후 다시 시도해 주세요."
        />
        {error.digest ? (
          <p className="text-center text-[11px] text-placeholder">오류 코드 {error.digest}</p>
        ) : null}
      </Body>
      <Footer pad="form" className="flex flex-col gap-[11px]">
        <PrimaryButton icon="refresh" onClick={() => unstable_retry()}>
          다시 시도
        </PrimaryButton>
        <OutlineButton href="/" icon="home">
          처음 화면으로
        </OutlineButton>
      </Footer>
    </div>
  );
}
