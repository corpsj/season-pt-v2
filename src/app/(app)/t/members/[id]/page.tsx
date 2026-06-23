import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Stat } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { getMemberDetail, getMemberRecordHref } from "@/lib/data/groups/trainer-home";
import { MessageMemberButton } from "./MessageMemberButton";

export default async function MemberDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [m, recordHref] = await Promise.all([getMemberDetail(id), getMemberRecordHref(id)]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">회원 상세</span>
        </div>

        {/* profile row */}
        <div className="mb-4 flex items-center gap-3">
          {m.isTeam && m.team ? (
            <TeamAvatar team={m.team} size={52} />
          ) : (
            <Avatar initial={m.initial} tone={m.avatarTone} size={52} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-ink">{m.name}</span>
              <Badge variant={m.badge.variant}>{m.badge.text}</Badge>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">
              {m.typeLabel} · 잔여 {m.remaining}회
            </div>
          </div>
        </div>

        {m.isTeam ? (
          <Banner tone="team" className="mb-3.5">
            2:1 팀 수업이에요. 두 회원의 잔여 횟수가 함께 차감돼요.
          </Banner>
        ) : null}

        {/* membership card */}
        <Card className="mb-3.5 bg-sage px-5 py-[18px] text-surface">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold">{m.product}</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface/15 px-2 py-1 text-[11px] font-semibold">
              <Icon name="clock" size={12} />D-{m.dDay}
            </span>
          </div>
          <div className="mb-3 mt-3 flex items-baseline gap-1.5">
            <span className="serif text-[40px] font-semibold leading-none">{m.remaining}</span>
            <span className="text-[14px] font-semibold text-surface/80">/ {m.total}회</span>
          </div>
          <ProgressBar pct={m.barPct} track="bg-surface/20" fill="bg-progress" />
          <div className="mt-3 text-[11.5px] font-medium text-surface/85">
            시작 {m.startDate} · 만료 {m.endDate}
          </div>
        </Card>

        {/* body composition */}
        <Card className="mb-3.5 flex px-[15px] py-3.5">
          <Stat value={m.body.weight} label="체중 (kg)" className="flex-1" />
          <div className="h-7 w-px self-center bg-ink/[0.08]" />
          <Stat value={m.body.skeletalMuscle} label="골격근 (kg)" className="flex-1" />
          <div className="h-7 w-px self-center bg-ink/[0.08]" />
          <Stat value={m.body.bodyFat} label="체지방 (%)" className="flex-1" />
        </Card>

        {/* regular schedule */}
        <Card className="mb-3.5 flex items-center gap-2.5 px-4 py-3.5">
          <Icon name="calendar" size={18} className="flex-none text-sage" />
          <span className="text-[13px] font-semibold text-ink">{m.schedule}</span>
        </Card>

        {m.injury ? (
          <Banner tone="warn" icon="triangle-exclamation">
            {m.injury}
          </Banner>
        ) : null}
        <div className="h-2" />
      </Body>

      <Footer>
        <div className="flex flex-col gap-2.5">
          <MessageMemberButton memberId={id} />
          <div className="flex gap-2.5">
            <OutlineButton icon="pencil" href={recordHref}>
              기록
            </OutlineButton>
            <PrimaryButton icon="refresh" href="/t/retention">
              재등록 안내
            </PrimaryButton>
          </div>
        </div>
      </Footer>
    </div>
  );
}
