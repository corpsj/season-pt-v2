"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { RadioOption } from "@/components/ui/RadioOption";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { getMemberRequest } from "@/lib/data";

type Mode = "change" | "cancel";

export default function MemberRequestPage() {
  const view = getMemberRequest();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("change");
  const [selected, setSelected] = useState(view.slots[0]?.id ?? "");

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/m" />
          <span className="text-[19px] font-bold text-ink">일정 변경 · 취소</span>
        </div>

        {/* class card */}
        <Card className="mb-5 flex items-center gap-3 px-[15px] py-[14px]">
          <div className="flex h-[46px] w-[46px] flex-none flex-col items-center justify-center rounded-[12px] bg-sage-banner2">
            <span className="text-[11px] font-bold text-sage-deep">{view.dateBox.weekday}</span>
            <span className="text-[17px] font-bold leading-none text-sage-deep">{view.dateBox.day}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">1:1 PT {view.time}</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-muted">{view.trainerName}</div>
          </div>
        </Card>

        <SegmentedToggle
          className="mb-5"
          options={[
            { value: "change", label: "시간 변경" },
            { value: "cancel", label: "수업 취소" },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === "change" ? (
          <>
            <div className="mb-2.5">
              <Kicker>원하는 시간</Kicker>
            </div>
            <div className="mb-5 flex flex-col gap-2.5">
              {view.slots.map((s) => (
                <RadioOption key={s.id} selected={selected === s.id} onClick={() => setSelected(s.id)}>
                  <span className="text-[14px] font-bold text-ink">{s.label}</span>
                </RadioOption>
              ))}
            </div>
          </>
        ) : null}

        <Banner tone="neutral">수업 24시간 전까지는 무료로 변경·취소할 수 있어요.</Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton
          icon="send"
          onClick={() => {
            toast("요청을 보냈어요");
            router.push("/m");
          }}
        >
          변경 요청 보내기
        </PrimaryButton>
      </Footer>
    </div>
  );
}
