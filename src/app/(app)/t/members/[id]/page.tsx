import Link from "next/link";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Stat } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PrimaryButton, MiniButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { getMemberDetail, getMemberRecordHref, getMe } from "@/lib/data/groups/trainer-home";
import { getMemberFiles } from "@/lib/data/groups/member-files";
import { getBodyHistory } from "@/lib/data/groups/body";
import { getMemberMeals } from "@/lib/data/groups/meals";
import { todayISO } from "@/lib/data/db";
import { BodyEntryButton } from "./BodyEntryButton";
import { MemberFilesSection } from "./MemberFilesSection";
import { MemberMealsSection } from "./MemberMealsSection";
import { MessageMemberButton } from "./MessageMemberButton";
import { MembershipActions } from "./MembershipActions";
import { EditMemberButton } from "./EditMemberButton";
import { MemberStatusControl } from "./MemberStatusControl";
import { DeleteMemberButton } from "./DeleteMemberButton";

const EV_LABEL: Record<string, string> = { extend: "연장", refund: "환불", transfer: "양도", issue: "발급", pause: "일시정지", resume: "재개" };

export default async function MemberDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [m, recordHref, me, photos, inbodies, mealsPage, bodyHistory] = await Promise.all([
    getMemberDetail(id),
    getMemberRecordHref(id),
    getMe(),
    getMemberFiles(id, "photo"),
    getMemberFiles(id, "inbody"),
    getMemberMeals(id),
    getBodyHistory(id, 5),
  ]);
  const meals = mealsPage.meals;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">회원 상세</span>
          {me.isOwner && (
            <div className="ml-auto">
              <EditMemberButton id={id} name={m.name} phone={m.phone} gender={m.gender} injury={m.injury} />
            </div>
          )}
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

        {/* 2:1 팀 — 두 회원을 나눠서 보기(전환) */}
        {m.isTeam && m.partnerId && m.partnerName ? (
          <div className="mb-3.5 flex items-center gap-1.5 rounded-[13px] border border-ink/[0.08] bg-card p-1.5">
            <span className="flex-1 rounded-[10px] bg-sage py-2 text-center text-[13px] font-bold text-surface">{m.name}</span>
            <Link
              href={`/t/members/${m.partnerId}`}
              className="tappable flex-1 rounded-[10px] py-2 text-center text-[13px] font-bold text-muted2"
            >
              {m.partnerName}
            </Link>
          </div>
        ) : null}

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
              <Icon name="clock" size={12} />{m.membershipPaused ? "일시정지" : `D-${m.dDay}`}
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

        {/* membership events history */}
        {m.events.length > 0 && (
          <Card className="mb-3.5 divide-y divide-ink/[0.06] px-4 py-1">
            {m.events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <span className="text-[13px] font-semibold text-ink">
                  {EV_LABEL[ev.type] ?? ev.type}
                  {ev.note ? <span className="ml-1.5 font-normal text-muted">{ev.note}</span> : null}
                </span>
                <span className="text-[12px] text-muted">{ev.createdAt.replace(/-/g, ".")}</span>
              </div>
            ))}
          </Card>
        )}

        {/* membership management */}
        <Card className="mb-3.5 px-4 py-[14px]">
          <div className="mb-2.5 text-[12.5px] font-semibold text-muted5">회원권 관리</div>
          <div className="grid grid-cols-3 gap-2">
            <MiniButton icon="ticket-fill" href={`/t/members/${id}/membership`}>
              발급
            </MiniButton>
            {m.activeMembershipId && (
              <MembershipActions
                membershipId={m.activeMembershipId}
                canExtend={!m.membershipPaused && m.remaining > 0}
                paused={m.membershipPaused}
                isTeam={m.isTeam}
              />
            )}
            <MiniButton icon="refresh" href="/t/retention">
              재등록
            </MiniButton>
          </div>
        </Card>

        {/* member status (대표 전용) */}
        {me.isOwner && m.memberStatus ? (
          <MemberStatusControl memberId={id} status={m.memberStatus} />
        ) : null}

        {/* body composition */}
        <Card className="mb-3.5 px-[15px] py-3.5">
          <div className="mb-3 flex items-center justify-between px-0.5">
            <span className="text-[12.5px] font-semibold text-muted5">체성분</span>
            <BodyEntryButton memberId={id} today={todayISO()} />
          </div>
          <div className="flex">
            <Stat value={m.body.weight} label="체중 (kg)" className="flex-1" />
            <div className="h-7 w-px self-center bg-ink/[0.08]" />
            <Stat value={m.body.skeletalMuscle} label="골격근 (kg)" className="flex-1" />
            <div className="h-7 w-px self-center bg-ink/[0.08]" />
            <Stat value={m.body.bodyFat} label="체지방 (%)" className="flex-1" />
          </div>
          {bodyHistory.length > 0 && (
            <div className="mt-3 divide-y divide-ink/[0.06] border-t border-ink/[0.06] pt-1">
              {bodyHistory.map((b) => (
                <div key={b.id} className="flex items-center gap-2 py-2 text-[12.5px]">
                  <span className="w-[52px] flex-none font-medium text-muted">{b.measuredAt.slice(5).replace("-", ".")}</span>
                  <span className="flex-1 font-semibold text-ink">
                    {[b.weight != null ? `${b.weight}kg` : null, b.skeletalMuscle != null ? `골격근 ${b.skeletalMuscle}` : null, b.bodyFat != null ? `체지방 ${b.bodyFat}%` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <MemberFilesSection kind="photo" memberId={id} initial={photos} />
        <MemberFilesSection kind="inbody" memberId={id} initial={inbodies} />
        <MemberMealsSection initial={meals} />

        {/* regular schedule */}
        <Card className="mb-3.5 flex items-center gap-2.5 px-4 py-3.5">
          <Icon name="calendar" size={18} className="flex-none text-sage" />
          <span className="text-[13px] font-semibold text-ink">{m.schedule}</span>
        </Card>

        {/* 2:1 팀 만들기/일정 편집 (대표 전용) — 팀이면 편집·해제, 아니면 새로 묶기 */}
        {me.isOwner ? (
          <Link
            href={`/t/members/${id}/team`}
            className="tappable mb-3.5 flex items-center gap-2.5 rounded-[13px] border border-dashed border-gold/45 bg-gold-bg px-4 py-3.5"
          >
            <Icon name="persons" size={18} className="flex-none text-gold" />
            <span className="flex-1 text-[13px] font-semibold text-ink-soft">{m.isTeam ? "2:1 팀 일정 편집" : "2:1 팀으로 묶기"}</span>
            <Icon name="chevron-right" size={16} className="flex-none text-gold" />
          </Link>
        ) : null}

        {m.injury ? (
          <Banner tone="warn" icon="triangle-exclamation">
            {m.injury}
          </Banner>
        ) : null}

        {/* 회원 완전 삭제 (대표 전용) — 탈퇴와 별도의 영구 삭제 */}
        {me.isOwner ? (
          <div className="mt-3.5">
            <DeleteMemberButton memberId={id} name={m.name} />
          </div>
        ) : null}
        <div className="h-2" />
      </Body>

      <Footer>
        <div className="flex gap-2.5">
          <MessageMemberButton memberId={id} />
          <PrimaryButton icon="document-text" href={recordHref}>
            기록
          </PrimaryButton>
        </div>
      </Footer>
    </div>
  );
}
