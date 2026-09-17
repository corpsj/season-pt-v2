import { cn } from "@/lib/cn";
import type { CalendarDay } from "@/lib/types";
import { Card } from "./Card";
import { Icon } from "./icon";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

export function CalendarGrid({
  monthLabel,
  days,
  firstWeekday = 0,
  onPick,
  onPrev,
  onNext,
}: {
  monthLabel: string;
  days: CalendarDay[];
  firstWeekday?: number;
  onPick?: (dateISO: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div role="group" aria-label={`${monthLabel} 달력`}>
      <Card className="px-[13px] py-[15px]">
      <div className="mb-[11px] flex items-center justify-between px-1">
        {onPrev ? (
          <button
            type="button"
            aria-label="이전 달"
            onClick={onPrev}
            className="tappable relative text-chevron after:absolute after:-inset-[13px] after:content-['']"
          >
            <Icon name="chevron-left" size={18} />
          </button>
        ) : (
          <span className="w-[18px]" aria-hidden />
        )}
        <span className="text-[15px] font-bold text-ink" aria-live="polite">{monthLabel}</span>
        {onNext ? (
          <button
            type="button"
            aria-label="다음 달"
            onClick={onNext}
            className="tappable relative text-sage-deep after:absolute after:-inset-[13px] after:content-['']"
          >
            <Icon name="chevron-right" size={18} />
          </button>
        ) : (
          <span className="w-[18px]" aria-hidden />
        )}
      </div>
      <div className="mb-[3px] grid grid-cols-7">
        {WD.map((d, i) => (
          <span
            key={d}
            aria-hidden="true"
            className={cn(
              "text-center text-[11px] font-semibold",
              i === 0 ? "text-sunday" : i === 6 ? "text-[#7e9a87]" : "text-placeholder"
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 [grid-auto-rows:44px]">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => {
          const [year, month, day] = d.dateISO.split("-").map(Number);
          const details = [d.hasDot ? "수업 있음" : null, d.hasRecordDot ? "기록 있음" : null]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={d.dateISO}
              type="button"
              onClick={() => onPick?.(d.dateISO)}
              aria-label={`${year}년 ${month}월 ${day}일${details ? `, ${details}` : ""}`}
              aria-pressed={d.selected}
              className="tappable relative flex flex-col items-center justify-center"
            >
              <span
                className={cn(
                  "flex h-[30px] w-[30px] items-center justify-center rounded-full",
                  d.selected
                    ? "bg-sage text-[13px] font-bold text-surface"
                    : d.isSunday
                      ? "text-[12.5px] font-medium text-sunday"
                      : "text-[12.5px] font-medium text-ink-row"
                )}
              >
                {d.n}
              </span>
              {(d.hasDot || d.hasRecordDot) && !d.selected ? (
                <span className="absolute bottom-[5px] flex items-center gap-[3px]">
                  {d.hasDot ? <span className="h-1 w-1 rounded-full bg-sage-soft" /> : null}
                  {d.hasRecordDot ? <span className="h-1 w-1 rounded-full bg-terracotta-text" /> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      </Card>
    </div>
  );
}
