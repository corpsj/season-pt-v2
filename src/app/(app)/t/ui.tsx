"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Badge } from "@/components/ui/Badge";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { trainerTabs } from "@/components/trainer/tabs";
import { cn } from "@/lib/cn";
import type { Me, TrainerCalendarData, TrainerDayClass, TrainerWeekDay } from "@/lib/types";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 ${WD[wd]}`;
}

export default function TrainerCalendarClient({
  me,
  cal,
  chatUnread,
  notifUnread,
}: {
  me: Me;
  cal: TrainerCalendarData;
  chatUnread: number;
  notifUnread: number;
}) {
  const [selected, setSelected] = useState(cal.initialSelected);
  const router = useRouter();
  const isWeek = cal.view === "week";

  const calDays = cal.calDays.map((d) => ({ ...d, selected: d.dateISO === selected }));
  const dayClasses = cal.classesByDate[selected] ?? [];

  // 뷰 전환은 보던 기간의 연속성 유지 — 월간→주간: 선택일의 주, 주간→월간: 주 중간(목)의 달.
  const toWeekHref = `/t?v=w&d=${selected}`;
  const toMonthHref = `/t?v=m&d=${cal.weekDays[3]?.dateISO ?? cal.todayISO}`;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">{cal.todayLabel}</div>
            <div className="whitespace-nowrap text-[21px] font-bold text-ink">
              {cal.meName} {cal.meRole}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/t/inbox"
              aria-label="조율 인박스"
              className="tappable relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
            >
              <Icon name="clock" size={20} />
              {cal.hasInbox ? (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-surface bg-terracotta px-1 text-[10px] font-bold text-surface">
                  {cal.inboxCount}
                </span>
              ) : null}
            </Link>
            <Link
              href="/t/notifications"
              aria-label="알림"
              className="tappable relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
            >
              <Icon name="bell-fill" size={20} />
              {notifUnread > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-surface bg-terracotta px-1 text-[10px] font-bold text-surface">
                  {notifUnread}
                </span>
              ) : null}
            </Link>
            <Link
              href="/t/settings"
              aria-label="설정"
              className="tappable flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
            >
              <Icon name="setting" size={20} />
            </Link>
          </div>
        </div>

        {/* expiring banner */}
        <Link
          href="/t/retention"
          className="tappable mb-3.5 flex items-center gap-2.5 rounded-[13px] border border-terracotta/[0.18] bg-warm-banner px-3.5 py-[11px]"
        >
          <Icon name="megaphone-fill" size={18} className="text-terracotta" />
          <span className="flex-1 text-[12.5px] font-bold text-terracotta-deep">
            만료 임박 회원 {cal.expiringCount}명 · 재등록 안내
          </span>
          <Icon name="chevron-right" size={15} className="text-terracotta" />
        </Link>

        {/* 월간/주간 view toggle */}
        <div className="mb-3 flex w-fit gap-1 rounded-[12px] bg-chip-soft p-[3px]">
          <Link
            href={toMonthHref}
            className={cn(
              "tappable rounded-[10px] px-[18px] py-[7px] text-[12.5px] font-bold",
              !isWeek ? "bg-sage text-surface" : "text-muted",
            )}
          >
            월간
          </Link>
          <Link
            href={toWeekHref}
            className={cn(
              "tappable rounded-[10px] px-[18px] py-[7px] text-[12.5px] font-bold",
              isWeek ? "bg-sage text-surface" : "text-muted",
            )}
          >
            주간
          </Link>
        </div>

        {isWeek ? (
          <WeekTimeGrid
            cal={cal}
            onPrev={() => router.push(`/t?v=w&d=${cal.prevD}`)}
            onNext={() => router.push(`/t?v=w&d=${cal.nextD}`)}
          />
        ) : (
          <>
            <CalendarGrid
              monthLabel={cal.periodLabel}
              days={calDays}
              firstWeekday={cal.firstWeekday}
              onPick={setSelected}
              onPrev={() => router.push(`/t?v=m&d=${cal.prevD}`)}
              onNext={() => router.push(`/t?v=m&d=${cal.nextD}`)}
            />

            <div className="mb-2.5 mt-3.5">
              <Kicker>
                {shortDateLabel(selected)} · 수업 {dayClasses.length}
              </Kicker>
            </div>

            {dayClasses.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {dayClasses.map((c) => (
                  <Card
                    key={c.sessionId}
                    className="tappable flex cursor-pointer items-center gap-3 px-[15px] py-[13px]"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(c.href)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <div className="h-9 w-1 flex-none rounded-[3px]" style={{ background: c.barColor }} />
                      <span className="w-[58px] flex-none text-[12.5px] font-bold text-ink">{c.time}</span>
                      <span className="flex-1 text-[13.5px] font-bold text-ink">{c.name}</span>
                    </button>
                    {c.showAttend ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/t/attend/${c.sessionId}`)}
                        className="tappable flex-none rounded-[9px] bg-sage px-[13px] py-[7px] text-[11.5px] font-bold text-surface"
                      >
                        출석
                      </button>
                    ) : c.badge ? (
                      <Badge variant={c.badge.variant}>{c.badge.text}</Badge>
                    ) : null}
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="calendar"
                title="예정된 수업이 없어요"
                desc="이 날은 비어 있어요. 회원 정기 일정에 따라 수업이 채워져요."
              />
            )}
          </>
        )}
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />
    </div>
  );
}

/* ---------------- 주간 시간표 그리드 ---------------- */

const HOUR_PX = 48;

function WeekTimeGrid({ cal, onPrev, onNext }: { cal: TrainerCalendarData; onPrev: () => void; onNext: () => void }) {
  const blocks = cal.weekDays.flatMap((d, di) =>
    (cal.classesByDate[d.dateISO] ?? []).map((c) => ({ c, di })),
  );
  // 기본 09–21시, 세션이 벗어나면 범위 자동 확장 (수업은 1시간 블록).
  const startHour = Math.min(9, ...blocks.map((b) => Math.floor(b.c.startMin / 60)));
  const endHour = Math.max(21, ...blocks.map((b) => Math.ceil((b.c.startMin + 60) / 60)));
  const hourCount = endHour - startHour;
  const hours = Array.from({ length: hourCount + 1 }, (_, i) => startHour + i);

  return (
    <>
      <Card className="px-[13px] pb-[18px] pt-[15px]">
        {/* period nav — CalendarGrid 헤더와 동일 스타일 */}
        <div className="mb-[13px] flex items-center justify-between px-1">
          <button type="button" aria-label="이전 주" onClick={onPrev} className="tappable text-chevron">
            <Icon name="chevron-left" size={18} />
          </button>
          <span className="text-[15px] font-bold text-ink">{cal.periodLabel}</span>
          <button type="button" aria-label="다음 주" onClick={onNext} className="tappable text-sage-deep">
            <Icon name="chevron-right" size={18} />
          </button>
        </div>

        {/* weekday header */}
        <div className="mb-2 flex">
          <div className="w-[38px] flex-none" />
          <div className="grid flex-1 grid-cols-7">
            {cal.weekDays.map((d) => (
              <WeekDayHead key={d.dateISO} d={d} />
            ))}
          </div>
        </div>

        {/* time grid */}
        <div className="flex">
          <div className="relative w-[38px] flex-none" style={{ height: hourCount * HOUR_PX }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute left-0 -translate-y-1/2 text-[10px] font-medium text-placeholder"
                style={{ top: i * HOUR_PX }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: hourCount * HOUR_PX }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-x-0 border-t border-ink/[0.06]" style={{ top: i * HOUR_PX }} />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="absolute inset-y-0 border-l border-ink/[0.04]"
                style={{ left: `${((i + 1) * 100) / 7}%` }}
              />
            ))}
            {cal.weekDays.map((d, di) => {
              const list = cal.classesByDate[d.dateISO] ?? [];
              return list.map((c, ci) => {
                // ponytail: 동일 시각 더블부킹은 우측으로 살짝 겹쳐 표시 — 한 강사 같은 슬롯 2개는 예외 상황
                const dup = list.slice(0, ci).filter((x) => x.startMin === c.startMin).length;
                return (
                  <WeekBlock key={c.sessionId} c={c} col={di} dup={dup} top={((c.startMin - startHour * 60) / 60) * HOUR_PX} />
                );
              });
            })}
          </div>
        </div>
      </Card>

      {/* legend */}
      <div className="mt-2.5 flex items-center justify-end gap-3 px-1">
        <LegendDot color="#768c6a" label="1:1" />
        <LegendDot color="#6e8aa0" label="2:1" />
        <LegendDot color="#8fa187" label="완료" />
        <LegendDot color="#d9d2c5" label="취소·노쇼" />
      </div>
    </>
  );
}

function WeekDayHead({ d }: { d: TrainerWeekDay }) {
  return (
    <div className="flex flex-col items-center gap-[3px]">
      <span
        className={cn(
          "text-[10.5px] font-semibold",
          d.isSunday ? "text-sunday" : d.isSaturday ? "text-[#7e9a87]" : "text-placeholder",
        )}
      >
        {d.wd}
      </span>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
          d.isToday ? "bg-sage font-bold text-surface" : "font-medium text-ink-row",
        )}
      >
        {d.day}
      </span>
    </div>
  );
}

function WeekBlock({ c, col, dup, top }: { c: TrainerDayClass; col: number; dup: number; top: number }) {
  const dead = c.status === "cancelled" || c.status === "noshow";
  return (
    <Link
      href={c.href}
      className={cn(
        "absolute flex flex-col items-center justify-center gap-px overflow-hidden rounded-[8px] px-0.5 text-center",
        dead && "bg-[#EDE8DD]",
      )}
      style={{
        left: `calc(${(col * 100) / 7}% + 1.5px + ${dup * 8}px)`,
        width: `calc(${100 / 7}% - 3px)`,
        top: top + 1.5,
        height: HOUR_PX - 3,
        background: dead ? undefined : c.barColor,
      }}
    >
      <span className={cn("w-full truncate text-[10.5px] font-bold leading-[1.25]", dead ? "text-muted line-through" : "text-surface")}>
        {c.name}
      </span>
      {c.sub ? (
        <span className={cn("w-full truncate text-[9.5px] font-semibold leading-[1.2]", dead ? "text-placeholder" : "text-surface/80")}>
          {c.sub}
        </span>
      ) : null}
    </Link>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted">
      <span className="h-2 w-2 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
