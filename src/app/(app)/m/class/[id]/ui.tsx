"use client";
import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/icon";
import type { BadgeVariant } from "@/lib/types";
import type { MemberClassDetailView, SessionFileItem, SessionMealItem } from "@/lib/types";

const STATUS: Record<MemberClassDetailView["status"], { label: string; variant: BadgeVariant }> = {
  scheduled: { label: "예정", variant: "scheduled" },
  attended: { label: "완료", variant: "done" },
  noshow: { label: "노쇼", variant: "cancelled" },
  cancelled: { label: "취소", variant: "cancelled" },
};

export function MemberClassDetailClient({ view }: { view: MemberClassDetailView }) {
  const status = STATUS[view.status];

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/m" />
          <span className="text-[19px] font-bold text-ink">수업 상세</span>
        </div>

        {/* class card */}
        <Card className="mb-5 flex items-center gap-3 px-[15px] py-[14px]">
          <div className="h-10 w-1 flex-none rounded-[3px] bg-sage" />
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold text-ink">{view.isTeam ? "2:1 PT" : "1:1 PT"}</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-muted">{view.dateLabel}</div>
            {view.trainerName ? (
              <div className="mt-0.5 text-[12.5px] font-medium text-muted">{view.trainerName} 선생님</div>
            ) : null}
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </Card>

        {/* 운동 기록 */}
        <div className="mb-2.5">
          <Kicker>운동 기록</Kicker>
        </div>
        {view.record ? (
          <Card className="mb-5 p-[15px]">
            {view.record.exercises.length > 0 ? (
              <div className="flex flex-col gap-2">
                {view.record.exercises.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{e.name}</span>
                    <span className="whitespace-nowrap text-[12.5px] font-medium text-muted">
                      {e.kg > 0 ? `${e.kg}kg · ` : ""}
                      {e.sets}세트
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12.5px] font-medium text-muted">기록된 운동이 없어요</div>
            )}
            {view.record.comment ? (
              <div className="mt-3 rounded-[10px] bg-chip-soft px-3 py-2.5 text-[12.5px] font-medium leading-[1.55] text-muted2">
                {view.record.comment}
              </div>
            ) : null}
          </Card>
        ) : (
          <Card className="mb-5 px-[15px] py-4 text-[12.5px] font-medium text-muted">
            {view.isFuture
              ? "수업이 끝나면 기록이 남아요"
              : "선생님이 기록을 남기면 여기에 보여요"}
          </Card>
        )}

        {/* 식단 */}
        <SectionHead title="식단" href="/m/my/meals" />
        {view.meals.length ? (
          <div className="mb-2.5 flex flex-col gap-2.5">
            {view.meals.map((m) => (
              <MealCard key={m.id} meal={m} />
            ))}
          </div>
        ) : (
          <Card className="mb-2.5 px-[15px] py-4 text-[12.5px] font-medium text-muted">
            이 날 식단 기록이 없어요
          </Card>
        )}
        {view.isToday ? (
          <Link
            href="/m/my/meals?add=1"
            className="tappable mb-5 flex items-center justify-center gap-2 rounded-[13px] border-[1.4px] border-dashed border-ink/[0.14] bg-card px-3.5 py-3"
          >
            <Icon name="plus-bold" size={14} className="text-sage-deep" />
            <span className="text-[13px] font-semibold text-muted">오늘 먹은 식단 기록하기</span>
          </Link>
        ) : (
          <div className="mb-5" />
        )}

        {/* 체형 기록 */}
        <SectionHead title="체형 기록" href="/m/my/body" />
        {view.files.length ? (
          <BodyRecords files={view.files} />
        ) : (
          <Card className="px-[15px] py-4 text-[12.5px] font-medium text-muted">이 날 체형 기록이 없어요</Card>
        )}

        {/* 일정 변경 — 강등 */}
        {view.isFuture && view.status === "scheduled" ? (
          <>
            <div className="mb-2.5 mt-5">
              <Kicker>일정 변경</Kicker>
            </div>
            <Link
              href={`/m/request?s=${view.sessionId}`}
              className="tappable flex items-center gap-2.5 rounded-[13px] border border-ink/[0.07] bg-card px-[15px] py-[13px]"
            >
              <Icon name="clock" size={17} className="flex-none text-sage-deep" />
              <span className="flex-1 text-[13px] font-semibold text-ink">일정 변경 · 취소 요청</span>
              <Icon name="chevron-right" size={15} className="flex-none text-muted" />
            </Link>
          </>
        ) : null}

        <div className="h-3.5" />
      </Body>
    </div>
  );
}

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-2 flex items-center justify-between px-0.5">
      <Kicker>{title}</Kicker>
      <Link href={href} className="tappable flex items-center gap-0.5 text-[12px] font-semibold text-sage-deep">
        전체보기
        <Icon name="chevron-right" size={13} />
      </Link>
    </div>
  );
}

function MealCard({ meal }: { meal: SessionMealItem }) {
  return (
    <Card className="flex gap-3 p-3">
      {meal.photoUrl ? (
        <a
          href={meal.photoUrl}
          target="_blank"
          rel="noreferrer"
          className="h-[52px] w-[52px] flex-none overflow-hidden rounded-[10px] bg-ink/[0.04]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={meal.photoUrl} alt="식단 사진" className="h-full w-full object-cover" />
        </a>
      ) : (
        <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[10px] bg-chip-soft text-sage-deep">
          <Icon name="fire" size={20} />
        </span>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-1.5">
          {meal.mealType ? (
            <span className="rounded-md bg-[#EDF4E3] px-1.5 py-0.5 text-[11px] font-bold text-sage-deep">{meal.mealType}</span>
          ) : null}
          <span className="text-[11.5px] font-medium text-muted">{meal.timeLabel}</span>
        </div>
        {meal.memo ? <div className="mt-1 truncate text-[13px] font-medium text-ink">{meal.memo}</div> : null}
        {meal.feedback ? (
          <div className="mt-1.5 flex items-start gap-1.5">
            <Icon name="message-fill" size={13} className="mt-[2px] flex-none text-sage-deep" />
            <span className="line-clamp-2 text-[12px] font-medium leading-snug text-[#4F5A45]">{meal.feedback}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function BodyRecords({ files }: { files: SessionFileItem[] }) {
  const photos = files.filter((f) => f.kind === "photo" && f.url);
  const inbodies = files.filter((f) => f.kind === "inbody");
  return (
    <div className="flex flex-col gap-2.5">
      {photos.length ? (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="진행 사진" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      {inbodies.length ? (
        <Card className="divide-y divide-ink/[0.06] px-4 py-1">
          {inbodies.map((f) => (
            <a key={f.id} href={f.url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-3">
              <Icon name="document-text" size={16} className="flex-none text-sage" />
              <span className="flex-1 truncate text-[13px] font-semibold text-ink">인바디 결과지</span>
              <Icon name="chevron-right" size={16} className="flex-none text-muted" />
            </a>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
