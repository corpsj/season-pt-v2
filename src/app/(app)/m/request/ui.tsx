"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { MemberRequestView } from "@/lib/types";
import { sendMemberRequest } from "@/lib/data/groups/member-actions";

type Mode = "change" | "cancel";

/** datetime-local 값("YYYY-MM-DDTHH:mm")을 KST 벽시계로 해석 → 실제 UTC ISO. (디바이스 tz 무관) */
function kstLocalToISO(v: string): string {
  const [date, time] = v.split("T");
  const [Y, M, D] = date.split("-").map(Number);
  const [H, Min] = (time ?? "0:0").split(":").map(Number);
  return new Date(Date.UTC(Y, M - 1, D, H - 9, Min || 0)).toISOString();
}

/** 현재 KST를 datetime-local min 값으로(과거 선택 방지). */
function kstNowLocal(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16);
}

export function MemberRequestClient({ view }: { view: MemberRequestView }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("change");
  const [desired, setDesired] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    if (mode === "change" && !desired) {
      toast("원하는 시간을 선택해주세요");
      return;
    }
    setPending(true);
    const proposedSlots = mode === "change" ? [kstLocalToISO(desired)] : undefined;
    const res = await sendMemberRequest({ sessionId: view.sessionId, type: mode, proposedSlots });
    if (!res.ok) {
      toast(res.error ?? "요청을 보내지 못했어요");
      setPending(false);
      return;
    }
    toast("요청을 보냈어요");
    router.push("/m");
    router.refresh();
  }

  // 예정 수업이 없으면 요일 빈칸·'0'일짜리 깨진 카드 대신 안내를 보여준다(감사 #40).
  if (!view.sessionId) {
    return (
      <div className="scr flex min-h-0 flex-1 flex-col">
        <Body>
          <div className="mb-5 flex items-center gap-3">
            <BackButton fallback="/m" />
            <span className="text-[19px] font-bold text-ink">일정 변경 · 취소</span>
          </div>
          <EmptyState
            icon="calendar"
            title="변경할 예정 수업이 없어요"
            desc="예정된 수업이 생기면 여기서 변경·취소를 요청할 수 있어요."
          />
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
          <span className="text-[19px] font-bold text-ink">일정 변경 · 취소</span>
        </div>

        {/* class card */}
        <Card className="mb-5 flex items-center gap-3 px-[15px] py-[14px]">
          <div className="flex h-[46px] w-[46px] flex-none flex-col items-center justify-center rounded-[12px] bg-sage-banner2">
            <span className="text-[11px] font-bold text-sage-deep">{view.dateBox.weekday}</span>
            <span className="text-[17px] font-bold leading-none text-sage-deep">{view.dateBox.day}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">{view.isTeam ? "2:1 PT" : "1:1 PT"} {view.time}</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-muted">{view.trainerName}</div>
          </div>
        </Card>

        {view.isTeam ? (
          <Banner tone="team" className="mb-5">
            2:1 팀 수업이에요. 시간을 변경·취소하면 {view.partnerName ? `${view.partnerName}님` : "팀원"}의 수업도 함께 바뀌어요.
          </Banner>
        ) : null}

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
            <Card className="mb-5 px-[15px] py-[14px]">
              <input
                type="datetime-local"
                value={desired}
                min={kstNowLocal()}
                onChange={(e) => setDesired(e.target.value)}
                className="w-full bg-transparent text-[15px] font-medium text-ink outline-none"
              />
            </Card>
          </>
        ) : null}

        <Banner tone="neutral">
          {mode === "change" ? "원하는 날짜·시간을 직접 선택해 선생님께 제안해요." : "선생님이 확인 후 처리해요."} 취소 차감은 스튜디오 정책을 따라요.
        </Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="send" onClick={submit} disabled={pending}>
          {mode === "change" ? "변경 요청 보내기" : "취소 요청 보내기"}
        </PrimaryButton>
      </Footer>
    </div>
  );
}
