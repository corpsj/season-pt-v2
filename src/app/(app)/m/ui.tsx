"use client";
import { useState } from "react";
import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { memberTabs } from "@/components/trainer/tabs";
import type { MemberCalendarView } from "@/lib/types";
import type { MemberCalendarDayMap } from "@/lib/data/groups/member";

export function MemberCalendarClient({
  view,
  dayMap,
  initialSelected,
  chatUnread,
}: {
  view: MemberCalendarView;
  dayMap: MemberCalendarDayMap;
  initialSelected: string;
  chatUnread: number;
}) {
  const [selected, setSelected] = useState(initialSelected);

  const calDays = view.calDays.map((d) => ({ ...d, selected: d.dateISO === selected }));
  const dayInfo = dayMap.days[selected];
  const selDateLabel = dayInfo?.selDateLabel ?? view.selDateLabel;
  const dayClass = dayInfo?.dayClass;

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
              잔여 {view.remaining} · {view.expired ? "만료" : `D-${view.dDay}`}
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
              선생님이 일정 변경을 요청했어요
            </span>
            <Icon name="chevron-right" size={15} className="text-terracotta" />
          </Link>
        ) : null}

        <CalendarGrid
          monthLabel={view.monthLabel}
          days={calDays}
          firstWeekday={dayMap.firstWeekday}
          onPick={setSelected}
        />

        {/* label + legend row */}
        <div className="mb-2.5 mt-3.5 flex items-center justify-between">
          <span className="text-[14px] font-bold text-ink">{selDateLabel}</span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-sage-soft" />
            {view.scheduleLegend}
          </span>
        </div>

        {dayClass ? (
          <Card className="flex items-center gap-3 px-[15px] py-[13px]">
            <div className="h-9 w-1 flex-none rounded-[3px] bg-sage" />
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-ink">1:1 PT · {dayClass.time}</div>
              <div className="mt-0.5 text-[12px] font-medium text-muted">{dayClass.trainerName}</div>
            </div>
            {dayClass.isPast ? (
              <span className="flex-none rounded-[9px] bg-chip-soft px-[11px] py-[7px] text-[11.5px] font-bold text-placeholder">
                지난 수업
              </span>
            ) : (
              <Link
                href={`/m/request?s=${dayClass.sessionId}`}
                className="tappable flex flex-none items-center gap-1 rounded-[9px] bg-sage-banner2 px-[11px] py-[7px] text-[11.5px] font-bold text-sage-deep"
              >
                <Icon name="clock" size={13} />
                변경
              </Link>
            )}
          </Card>
        ) : (
          <EmptyState icon="calendar" title="이 날은 수업이 없어요" />
        )}
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={memberTabs({ chatUnread })} liveChat />
    </div>
  );
}
