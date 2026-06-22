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
import { getMemberCalendar, getChatUnread } from "@/lib/data";
import { memberTabs } from "@/components/trainer/tabs";

export default function MemberCalendarPage() {
  const [selected, setSelected] = useState("2026-06-21");
  const view = getMemberCalendar(selected);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">내 일정</div>
            <div className="whitespace-nowrap text-[21px] font-bold text-ink">{view.name} 님</div>
          </div>
          <Badge variant="remaining" icon="ticket-fill">
            잔여 {view.remaining} · D-{view.dDay}
          </Badge>
        </div>

        {/* trainer change-request banner */}
        {view.hasTrainerReq ? (
          <Link
            href="/m/receive"
            className="tappable mb-3.5 flex items-center gap-2.5 rounded-[13px] border border-terracotta/[0.18] bg-warm-banner px-3.5 py-[11px]"
          >
            <Icon name="refresh" size={18} className="text-terracotta" />
            <span className="flex-1 text-[12.5px] font-bold text-terracotta-deep">
              트레이너가 일정 변경을 요청했어요
            </span>
            <Icon name="chevron-right" size={15} className="text-terracotta" />
          </Link>
        ) : null}

        <CalendarGrid
          monthLabel={view.monthLabel}
          days={view.calDays}
          firstWeekday={0}
          onPick={setSelected}
        />

        {/* label + legend row */}
        <div className="mb-2.5 mt-3.5 flex items-center justify-between">
          <span className="text-[14px] font-bold text-ink">{view.selDateLabel}</span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-sage-soft" />
            {view.scheduleLegend}
          </span>
        </div>

        {view.dayClass ? (
          <Card className="flex items-center gap-3 px-[15px] py-[13px]">
            <div className="h-9 w-1 flex-none rounded-[3px] bg-sage" />
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-ink">1:1 PT · {view.dayClass.time}</div>
              <div className="mt-0.5 text-[12px] font-medium text-muted">{view.dayClass.trainerName}</div>
            </div>
            <Link
              href="/m/request"
              className="tappable flex flex-none items-center gap-1 rounded-[9px] bg-sage-banner2 px-[11px] py-[7px] text-[11.5px] font-bold text-sage-deep"
            >
              <Icon name="refresh" size={13} />
              변경
            </Link>
          </Card>
        ) : (
          <EmptyState icon="calendar" title="이 날은 수업이 없어요" />
        )}
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={memberTabs({ chatUnread: getChatUnread() })} />
    </div>
  );
}
