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
    <Card className="px-[13px] py-[15px]">
      <div className="mb-[11px] flex items-center justify-between px-1">
        <button type="button" aria-label="이전 달" onClick={onPrev} className="tappable text-chevron">
          <Icon name="chevron-left" size={18} />
        </button>
        <span className="text-[15px] font-bold text-ink">{monthLabel}</span>
        <button type="button" aria-label="다음 달" onClick={onNext} className="tappable text-sage-deep">
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
      <div className="mb-[3px] grid grid-cols-7">
        {WD.map((d, i) => (
          <span
            key={d}
            className={cn(
              "text-center text-[11px] font-semibold",
              i === 0 ? "text-sunday" : i === 6 ? "text-[#7e9a87]" : "text-placeholder"
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 [grid-auto-rows:36px]">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((d) => (
          <button
            key={d.dateISO}
            type="button"
            onClick={() => onPick?.(d.dateISO)}
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
            {d.hasDot && !d.selected ? (
              <span className="absolute bottom-[5px] h-1 w-1 rounded-full bg-sage-soft" />
            ) : null}
          </button>
        ))}
      </div>
    </Card>
  );
}
