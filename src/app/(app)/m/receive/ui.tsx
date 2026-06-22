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
  const [selected, setSelected] = useState(view.slots[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  async function accept() {
    if (!requestId || pending) return;
    setPending(true);
    const res = await acceptMemberChange(requestId, slotIsoById[selected]);
    if (res.ok) {
      router.push("/confirm?to=/m");
    } else {
      setPending(false);
      toast(res.error ?? "변경하지 못했어요");
    }
  }

  async function reject() {
    if (!requestId || pending) return;
    setPending(true);
    const res = await rejectMemberChange(requestId);
    toast(res.ok ? "요청을 거절했어요" : res.error ?? "처리하지 못했어요");
    router.push("/m");
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/m" />
          <span className="text-[19px] font-bold text-ink">일정 변경 요청</span>
        </div>

        {/* trainer row */}
        <div className="mb-4 flex items-center gap-2.5">
          <Avatar initial="계" tone="sage" size={36} />
          <span className="text-[14px] font-bold text-ink">{view.trainerName} 트레이너</span>
          <span className="text-[12px] font-medium text-muted">{view.ago}</span>
        </div>

        {/* before card */}
        <Card className="mb-5 px-[15px] py-[14px]">
          <div className="mb-1 text-[12px] font-semibold text-muted5">변경 전</div>
          <div className="text-[14px] font-medium text-muted6 line-through">{view.before}</div>
          {view.reason ? (
            <div className="mt-2 text-[12.5px] font-medium leading-[1.5] text-muted2">{view.reason}</div>
          ) : null}
        </Card>

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
        <div className="h-3.5" />
      </Body>

      <Footer>
        <div className="flex flex-col gap-2.5">
          <PrimaryButton onClick={accept}>이 시간으로 변경</PrimaryButton>
          <OutlineButton href="/m/request">다른 시간 제안</OutlineButton>
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
