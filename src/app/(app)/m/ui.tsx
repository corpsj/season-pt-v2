"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { exerciseLine } from "@/lib/data/workout-format";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { memberTabs } from "@/components/trainer/tabs";
import type { MemberCalendarView } from "@/lib/types";
import type {
  MemberCalendarDayMap,
  MemberDayFile,
  MemberDayMeal,
  MemberDayWorkout,
} from "@/lib/data/groups/member";

export function MemberCalendarClient({
  view,
  trainerReqCount,
  dayMap,
  initialSelected,
  chatUnread,
  prevM,
  nextM,
  today,
}: {
  view: MemberCalendarView;
  trainerReqCount: number;
  dayMap: MemberCalendarDayMap;
  initialSelected: string;
  chatUnread: number;
  prevM: string;
  nextM: string;
  today: string; // YYYY-MM-DD (KST)
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialSelected);

  const hasDayRecord = (d: string) => {
    const info = dayMap.days[d];
    return !!info && info.workouts.length + info.meals.length + info.files.length + info.measures.length > 0;
  };
  const calDays = view.calDays.map((d) => ({
    ...d,
    selected: d.dateISO === selected,
    hasRecordDot: hasDayRecord(d.dateISO),
  }));
  const dayInfo = dayMap.days[selected];
  const selDateLabel = dayInfo?.selDateLabel ?? view.selDateLabel;
  const dayClasses = dayInfo?.dayClasses ?? [];
  const dayWorkouts = dayInfo?.workouts ?? [];
  const dayMeals = dayInfo?.meals ?? [];
  const dayFiles = dayInfo?.files ?? [];
  const dayMeasures = dayInfo?.measures ?? [];
  const isToday = selected === today;
  const canLog = selected <= today; // 오늘·지난 날만 기록 추가(미래 날짜 제외)
  const hasRecords = dayWorkouts.length + dayMeals.length + dayFiles.length + dayMeasures.length > 0;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">내 일정</div>
            <div className="whitespace-nowrap text-[21px] font-bold text-ink">{view.name} 님</div>
          </div>
          {view.hasMembership ? (
            <Badge variant="remaining" icon="ticket-fill">
              잔여 {view.remaining} · {view.expired ? "만료" : view.paused ? "일시정지" : `D-${view.dDay}`}
            </Badge>
          ) : null}
        </div>

        {/* trainer change-request banner */}
        {view.hasTrainerReq ? (
          <Link
            href="/m/receive"
            className="tappable mb-3.5 flex items-center gap-2.5 rounded-[13px] border border-terracotta/[0.18] bg-warm-banner px-3.5 py-[11px]"
          >
            <Icon name="clock" size={18} className="text-terracotta" />
            <span className="flex-1 text-[12.5px] font-bold text-terracotta-deep">
              선생님이 일정 변경을 요청했어요{trainerReqCount >= 2 ? ` · ${trainerReqCount}건` : ""}
            </span>
            <Icon name="chevron-right" size={15} className="text-terracotta" />
          </Link>
        ) : null}

        <CalendarGrid
          monthLabel={view.monthLabel}
          days={calDays}
          firstWeekday={dayMap.firstWeekday}
          onPick={setSelected}
          onPrev={() => router.push(`/m?m=${prevM}`)}
          onNext={() => router.push(`/m?m=${nextM}`)}
        />

        {/* label + legend row */}
        <div className="mb-2.5 mt-3.5 flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-[14px] font-bold text-ink">{selDateLabel}</span>
          <span className="flex min-w-0 items-center gap-2.5 text-[12px] font-semibold text-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-sage-soft" />
              <span className="truncate">{view.scheduleLegend}</span>
            </span>
            <span className="flex flex-none items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-terracotta-text" />
              기록
            </span>
          </span>
        </div>

        {dayClasses.length ? (
          <div className="flex flex-col gap-2.5">
            {dayClasses.map((dayClass) => (
              <Link
                key={dayClass.sessionId}
                href={`/m/class/${dayClass.sessionId}`}
                className="tappable"
              >
                <Card className="flex items-center gap-3 px-[15px] py-[13px]">
                  <div className="h-9 w-1 flex-none rounded-[3px] bg-sage" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-ink">1:1 PT · {dayClass.time}</div>
                    <div className="mt-0.5 text-[12px] font-medium text-muted">{dayClass.trainerName}</div>
                  </div>
                  <Icon name="chevron-right" size={16} className="flex-none text-muted" />
                </Card>
              </Link>
            ))}
          </div>
        ) : !hasRecords ? (
          // 미래 날짜에 "기록이 없어요"는 당연한 말이라 소음 — 지난 날짜/오늘에만 기록까지 언급.
          <EmptyState icon="calendar" title={selected <= today ? "이 날은 수업과 기록이 없어요" : "이 날은 수업이 없어요"} />
        ) : null}

        {dayWorkouts.length || isToday ? (
          <RecordSection title="운동 기록" href="/m/my/records">
            {dayWorkouts.map((w) => (
              <DayWorkoutCard key={w.id} workout={w} showTime={dayWorkouts.length > 1} />
            ))}
            {isToday ? (
              <Link
                href="/m/my/records?add=1"
                className="tappable flex items-center justify-center gap-2 rounded-[13px] border-[1.4px] border-dashed border-ink/[0.14] bg-card px-3.5 py-3"
              >
                <Icon name="plus-bold" size={14} className="text-sage-deep" />
                <span className="text-[13px] font-semibold text-muted">오늘 운동 기록하기</span>
              </Link>
            ) : null}
          </RecordSection>
        ) : null}

        {dayMeals.length || canLog ? (
          <RecordSection title="식단" href="/m/my/meals">
            {dayMeals.map((m) => (
              <DayMealCard key={m.id} meal={m} />
            ))}
            {canLog ? (
              <Link
                href={isToday ? "/m/my/meals?add=1" : `/m/my/meals?add=1&date=${selected}`}
                className="tappable flex items-center justify-center gap-2 rounded-[13px] border-[1.4px] border-dashed border-ink/[0.14] bg-card px-3.5 py-3"
              >
                <Icon name="plus-bold" size={14} className="text-sage-deep" />
                <span className="text-[13px] font-semibold text-muted">{isToday ? "오늘 먹은 식단 기록하기" : "이 날 식단 기록하기"}</span>
              </Link>
            ) : null}
          </RecordSection>
        ) : null}

        {dayFiles.length || dayMeasures.length ? (
          <RecordSection title="체형 기록" href="/m/my/body">
            {dayMeasures.length ? (
              <Card className="divide-y divide-ink/[0.06] px-4 py-1">
                {dayMeasures.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 py-2.5">
                    <Icon name="person" size={15} className="flex-none text-sage" />
                    <span className="text-[13px] font-semibold text-ink">{b.summary}</span>
                  </div>
                ))}
              </Card>
            ) : null}
            <DayBodyRecords files={dayFiles} />
          </RecordSection>
        ) : null}
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={memberTabs({ chatUnread })} liveChat />
    </div>
  );
}

/* ---------------- 날짜별 기록 섹션 (운동·식단·체형) ---------------- */

function RecordSection({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[12.5px] font-semibold text-muted5">{title}</span>
        <Link href={href} className="tappable flex items-center gap-0.5 text-[12px] font-semibold text-sage-deep">
          전체보기
          <Icon name="chevron-right" size={13} />
        </Link>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function DayWorkoutCard({ workout, showTime }: { workout: MemberDayWorkout; showTime: boolean }) {
  return (
    <Card className="p-[15px]">
      {showTime || workout.isFree ? (
        <div className="mb-2 text-[12px] font-semibold text-muted">
          {workout.time} {workout.isFree ? "· 직접 기록" : "수업"}
        </div>
      ) : null}
      {workout.exercises.length > 0 ? (
        <div className="flex flex-col gap-2">
          {workout.exercises.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{e.name}</span>
              <span className="whitespace-nowrap text-[12.5px] font-medium text-muted">
                {exerciseLine(e)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12.5px] font-medium text-muted">기록된 운동이 없어요</div>
      )}
      {workout.comment ? (
        <div className="mt-3 rounded-[10px] bg-chip-soft px-3 py-2.5 text-[12.5px] font-medium leading-[1.55] text-muted2">
          {workout.comment}
        </div>
      ) : null}
    </Card>
  );
}

function DayMealCard({ meal }: { meal: MemberDayMeal }) {
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
          <span className="text-[11.5px] font-medium text-muted">{meal.time}</span>
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

function DayBodyRecords({ files }: { files: MemberDayFile[] }) {
  const photos = files.filter((f) => f.kind === "photo" && f.url);
  const inbodies = files.filter((f) => f.kind === "inbody");
  return (
    <>
      {photos.length ? (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((f) => (
            <a key={f.id} href={f.url!} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url!} alt="진행 사진" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      {inbodies.length ? (
        <Card className="divide-y divide-ink/[0.06] px-4 py-1">
          {inbodies.map((f) => (
            <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-3">
              <Icon name="document-text" size={16} className="flex-none text-sage" />
              <span className="flex-1 truncate text-[13px] font-semibold text-ink">인바디 결과지</span>
              <Icon name="chevron-right" size={16} className="flex-none text-muted" />
            </a>
          ))}
        </Card>
      ) : null}
    </>
  );
}
