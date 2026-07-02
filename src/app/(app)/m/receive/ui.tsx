"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { RadioOption } from "@/components/ui/RadioOption";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { MemberReceiveView } from "@/lib/types";
import { acceptMemberChange, rejectMemberChange } from "@/lib/data/groups/member-actions";

export function MemberReceiveClient({
  view,
  requestId,
  slotIsoById,
}: {
  view: MemberReceiveView;
  requestId: string | null;
  slotIsoById: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const isCancel = view.type === "cancel";
  const [selected, setSelected] = useState(view.slots[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  async function accept() {
    if (!requestId || pending) return;
    setPending(true);
    const res = await acceptMemberChange(requestId, isCancel ? undefined : slotIsoById[selected]);
    if (res.ok) {
      if (isCancel) {
        toast("수업 취소를 확인했어요");
        router.push("/m");
      } else {
        router.push("/confirm?to=/m");
      }
    } else {
      setPending(false);
      toast(res.error ?? (isCancel ? "처리하지 못했어요" : "변경하지 못했어요"));
      router.refresh(); // 이미 처리·만료된 요청이면 화면을 최신 상태로(죽은 버튼 방지, 감사 #39)
    }
  }

  async function reject() {
    if (!requestId || pending) return;
    setPending(true);
    const res = await rejectMemberChange(requestId);
    toast(res.ok ? "요청을 거절했어요" : res.error ?? "처리하지 못했어요");
    router.push("/m");
  }

  // 요청이 이미 처리·소멸됐으면 빈 정보 화면 + 반응 없는 버튼 대신 안내를 보여준다(감사 #39).
  if (!requestId) {
    return (
      <div className="scr flex min-h-0 flex-1 flex-col">
        <Body>
          <div className="mb-5 flex items-center gap-3">
            <BackButton fallback="/m" />
            <span className="text-[19px] font-bold text-ink">일정 요청</span>
          </div>
          <EmptyState icon="circle-check" tone="green" title="처리할 요청이 없어요" desc="요청이 이미 처리됐거나 만료됐어요." />
        </Body>
        <Footer>
          <PrimaryButton onClick={() => router.push("/m")}>홈으로 가기</PrimaryButton>
        </Footer>
      </div>
    );
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/m" />
          <span className="text-[19px] font-bold text-ink">{isCancel ? "수업 취소 요청" : "일정 변경 요청"}</span>
        </div>

        {/* trainer row */}
        <div className="mb-4 flex items-center gap-2.5">
          <Avatar initial={view.trainerName.charAt(0) || "선"} tone="sage" size={36} />
          <span className="text-[14px] font-bold text-ink">{view.trainerName} 선생님</span>
          <span className="text-[12px] font-medium text-muted">{view.ago}</span>
        </div>

        {/* target session card */}
        <Card className="mb-5 px-[15px] py-[14px]">
          <div className="mb-1 text-[12px] font-semibold text-muted5">{isCancel ? "취소할 수업" : "변경 전"}</div>
          <div className={`text-[14px] font-medium ${isCancel ? "text-ink" : "text-muted6 line-through"}`}>{view.before}</div>
          {view.reason ? (
            <div className="mt-2 text-[12.5px] font-medium leading-[1.5] text-muted2">{view.reason}</div>
          ) : null}
        </Card>

        {isCancel ? (
          <p className="text-[13px] leading-[1.6] text-muted2">
            선생님이 이 수업의 취소를 요청했어요. 수락하면 수업이 취소되고 회차는 차감되지 않아요.
          </p>
        ) : (
          <>
            <div className="mb-2.5">
              <Kicker>제안된 시간 · 하나를 선택</Kicker>
            </div>
            <div className="flex flex-col gap-2.5">
              {view.slots.map((s) => (
                <RadioOption key={s.id} selected={selected === s.id} onClick={() => setSelected(s.id)}>
                  <span className="text-[14px] font-bold text-ink">{s.label}</span>
                </RadioOption>
              ))}
            </div>
          </>
        )}
        <div className="h-3.5" />
      </Body>

      <Footer>
        <div className="flex flex-col gap-2.5">
          {isCancel ? (
            <PrimaryButton onClick={accept}>수업 취소 수락</PrimaryButton>
          ) : (
            <>
              <PrimaryButton onClick={accept}>이 시간으로 변경</PrimaryButton>
              <OutlineButton href={view.sessionId ? `/m/request?s=${view.sessionId}` : "/m/request"}>다른 시간 제안</OutlineButton>
            </>
          )}
          <button
            type="button"
            onClick={reject}
            className="tappable mt-1 text-center text-[13px] font-semibold text-terracotta-link"
          >
            거절하기
          </button>
        </div>
      </Footer>
    </div>
  );
}
