"use client";
import Link from "next/link";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import type { AvatarTone, TeamAvatar as TeamAvatarType } from "@/lib/types";

type ClassDetailView = {
  sessionId: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  isTeam: boolean;
  team?: TeamAvatarType;
  typeLabel: string;
  dateLabel: string;
};

export default function ClassDetailClient({ id, view }: { id: string; view: ClassDetailView }) {
  const toast = useToast();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-2.5">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">수업 상세</span>
        </div>

        {/* member card */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            {view.isTeam && view.team ? (
              <TeamAvatar team={view.team} size={42} />
            ) : (
              <Avatar initial={view.initial} tone={view.avatarTone} size={42} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-ink">{view.name}</span>
                <Badge variant="scheduled">예정</Badge>
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted">{view.typeLabel}</div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-2 rounded-[13px] bg-sage-banner2 px-3.5 py-3">
            <Icon name="calendar" size={17} className="text-sage-deep" />
            <span className="text-[13px] font-semibold text-sage-deep">{view.dateLabel}</span>
          </div>
        </Card>

        <div className="mb-2.5 mt-5">
          <Kicker>일정 조율</Kicker>
        </div>

        <Card className="overflow-hidden">
          <Link
            href={`/t/class/${id}/propose`}
            className="tappable flex w-full items-center gap-3 px-4 py-[15px] text-left"
          >
            <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-sage-banner2">
              <Icon name="clock" size={18} className="text-sage-deep" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">일정 변경 요청</span>
              <span className="mt-0.5 block text-[12px] text-muted">
                회원에게 다른 시간을 제안해요
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="text-chevron" />
          </Link>

          <div className="mx-4 border-t border-ink/[0.07]" />

          <button
            type="button"
            onClick={() => toast("취소 요청을 보냈어요")}
            className="tappable flex w-full items-center gap-3 px-4 py-[15px] text-left"
          >
            <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-warm-banner">
              <Icon name="close" size={18} className="text-terracotta" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-ink">수업 취소 요청</span>
              <span className="mt-0.5 block text-[12px] text-muted">
                이번 수업 취소를 요청해요
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="text-chevron" />
          </button>
        </Card>

        <Banner tone="neutral" className="mt-3.5">
          변경·취소 요청은 수업 24시간 전까지 보낼 수 있어요.
        </Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton href={`/t/attend/${id}`}>출석 체크</PrimaryButton>
      </Footer>
    </div>
  );
}
