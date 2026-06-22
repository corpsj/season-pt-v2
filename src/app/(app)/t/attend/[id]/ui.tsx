"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icon";
import { RadioOption } from "@/components/ui/RadioOption";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { confirmAttendance } from "@/lib/data/groups/scheduling-actions";
import type { AttendTarget } from "@/lib/types";

type Method = "attend" | "noshow" | "cancel";

export default function AttendClient({ target: t }: { target: AttendTarget }) {
  const router = useRouter();
  const toast = useToast();
  const [method, setMethod] = useState<Method>("attend");

  const after = method === "cancel" ? t.remaining : t.remaining - 1;
  const cta = method === "cancel" ? "수업 취소 기록" : "출석 처리하기";

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">출석 체크</span>
        </div>

        {/* target */}
        <Card className="flex items-center gap-3.5 p-5">
          {t.isTeam && t.team ? <TeamAvatar team={t.team} size={54} /> : <Avatar initial={t.initial} tone={t.avatarTone} size={54} />}
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-ink">{t.name}</div>
            <div className="text-[13px] text-muted2">{t.meta}</div>
          </div>
        </Card>

        {t.isTeam ? (
          <Banner tone="team" className="mt-3.5">
            2:1 팀은 함께 출석·차감돼요. 한 분만 따로 처리할 수 없어요.
          </Banner>
        ) : null}

        <div className="mb-2.5 mt-5">
          <Kicker>처리 방식</Kicker>
        </div>

        <div className="flex flex-col gap-2.5">
          <RadioOption
            selected={method === "attend"}
            onClick={() => setMethod("attend")}
            right={<span className="text-[12.5px] font-semibold text-sage-deep">기본</span>}
          >
            <span className="text-[14px] font-bold text-ink">{t.isTeam ? "팀 출석" : "출석"}</span>
          </RadioOption>
          <RadioOption selected={method === "noshow"} onClick={() => setMethod("noshow")}>
            <span className="text-[14px] font-bold text-ink">{t.isTeam ? "팀 노쇼" : "노쇼"}</span>
            <span className="text-[14px] font-medium text-muted2"> (차감)</span>
          </RadioOption>
          <RadioOption selected={method === "cancel"} onClick={() => setMethod("cancel")}>
            <span className="text-[14px] font-bold text-ink">수업 취소</span>
            <span className="text-[14px] font-medium text-muted2"> (미차감)</span>
          </RadioOption>
        </div>

        {/* remaining */}
        <Card className="mt-3.5 flex items-center gap-3 px-[15px] py-[13px]">
          <Icon name="ticket-fill" size={18} className="flex-none text-sage-deep" />
          <span className="flex-1 text-[13.5px] font-medium text-ink-soft">차감 후 잔여</span>
          <span className="serif text-[18px] font-bold text-ink">{t.remaining}</span>
          <Icon name="arrow-right" size={16} className="flex-none text-chevron" />
          <span className="serif text-[18px] font-bold text-terracotta">{after}</span>
        </Card>
      </Body>

      <Footer>
        <PrimaryButton
          icon="check-bold"
          onClick={async () => {
            await confirmAttendance(t.sessionId, method);
            toast("출석이 기록되었어요");
            router.push("/t");
          }}
        >
          {cta}
        </PrimaryButton>
        <p className="mt-2.5 text-center text-[12px] font-medium text-muted3">
          모든 차감·정정은 이력에 자동 기록돼요
        </p>
      </Footer>
    </div>
  );
}
