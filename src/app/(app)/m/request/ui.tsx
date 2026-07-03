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
const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** "YYYY-MM-DD"(KST 날짜) + "HH:mm"(KST 시각)을 KST 벽시계로 해석 → 실제 UTC ISO. (디바이스 tz 무관) */
function kstLocalToISO(date: string, time: string): string {
  const [Y, M, D] = date.split("-").map(Number);
  const [H, Min] = (time || "0:0").split(":").map(Number);
  return new Date(Date.UTC(Y, M - 1, D, H - 9, Min || 0)).toISOString();
}

/** 오늘부터 KST 기준 n일치 날짜 칩. UTC 필드가 곧 KST 벽시계(=+9h 시프트). */
function kstDays(n: number): { value: string; weekday: string; day: number; rel: string }[] {
  const base = Date.now() + 9 * 3600000;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base + i * 86400000);
    return {
      value: d.toISOString().slice(0, 10),
      weekday: WD[d.getUTCDay()],
      day: d.getUTCDate(),
      rel: i === 0 ? "오늘" : i === 1 ? "내일" : "",
    };
  });
}

export function MemberRequestClient({ view }: { view: MemberRequestView }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("change");
  const [date, setDate] = useState("");
  const [time, setTime] = useState(view.timeHM); // 기본값 = 원래 수업 시간(날짜만 바꾸는 흔한 경우 그대로 제안)
  const [pending, setPending] = useState(false);
  const days = kstDays(14);

  async function submit() {
    if (pending) return;
    if (mode === "change" && (!date || !time)) {
      toast("원하는 날짜와 시간을 선택해주세요", "error");
      return;
    }
    if (mode === "change") {
      const iso = kstLocalToISO(date, time);
      if (iso <= new Date().toISOString()) {
        toast("지난 시간은 선택할 수 없어요", "error");
        return;
      }
    }
    setPending(true);
    const proposedSlots = mode === "change" ? [kstLocalToISO(date, time)] : undefined;
    const res = await sendMemberRequest({ sessionId: view.sessionId, type: mode, proposedSlots });
    if (!res.ok) {
      toast(res.error ?? "요청을 보내지 못했어요", "error");
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
              <Kicker>원하는 날짜</Kicker>
            </div>
            <div className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {days.map((d) => {
                const on = date === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDate(d.value)}
                    className={`tappable flex w-[52px] flex-none flex-col items-center gap-0.5 rounded-[14px] py-2.5 ${
                      on ? "bg-sage text-surface" : "border border-ink/10 bg-card text-muted5"
                    }`}
                  >
                    <span className="text-[11px] font-semibold">{d.rel || d.weekday}</span>
                    <span className="text-[17px] font-bold leading-none">{d.day}</span>
                  </button>
                );
              })}
            </div>

            <div className="mb-2.5">
              <Kicker>원하는 시간</Kicker>
            </div>
            <Card className="mb-5 px-[15px] py-[14px]">
              <input
                type="time"
                value={time}
                step={1800}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-transparent text-[15px] font-medium text-ink outline-none"
              />
            </Card>
          </>
        ) : null}

        <Banner tone="neutral">
          {mode === "change" ? "원하는 날짜·시간을 직접 선택해 선생님께 제안해요." : "선생님이 확인 후 처리해요."} 취소 차감은 매장 정책을 따라요.
        </Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="send" onClick={submit} pending={pending}>
          {mode === "change" ? "변경 요청 보내기" : "취소 요청 보내기"}
        </PrimaryButton>
      </Footer>
    </div>
  );
}
