"use client";
import { useMemo, useState } from "react";
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
import type { Me, TrainerCalendarView, TrainerDayClass } from "@/lib/types";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 ${WD[wd]}`;
}

export default function TrainerCalendarClient({
  me,
  base,
  classesByDate,
  todayISO,
  chatUnread,
}: {
  me: Me;
  base: TrainerCalendarView;
  classesByDate: Record<string, TrainerDayClass[]>;
  todayISO: string;
  chatUnread: number;
}) {
  const [selected, setSelected] = useState(todayISO);
  const router = useRouter();

  const calDays = useMemo(
    () => base.calDays.map((d) => ({ ...d, selected: d.dateISO === selected })),
    [base.calDays, selected]
  );
  const dayClasses = classesByDate[selected] ?? [];
  const selDateLabel = shortDateLabel(selected);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">{base.todayLabel}</div>
            <div className="whitespace-nowrap text-[21px] font-bold text-ink">
              {base.meName} {base.meRole}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/t/inbox"
              aria-label="조율 인박스"
              className="tappable relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
            >
              <Icon name="refresh" size={20} />
              {base.hasInbox ? (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-surface bg-terracotta px-1 text-[10px] font-bold text-surface">
                  {base.inboxCount}
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
            만료 임박 회원 {base.expiringCount}명 · 재등록 안내
          </span>
          <Icon name="chevron-right" size={15} className="text-terracotta" />
        </Link>

        <CalendarGrid
          monthLabel={base.monthLabel}
          days={calDays}
          firstWeekday={0}
          onPick={setSelected}
        />

        <div className="mb-2.5 mt-3.5">
          <Kicker>
            {selDateLabel} · 수업 {dayClasses.length}
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
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} />
    </div>
  );
}
