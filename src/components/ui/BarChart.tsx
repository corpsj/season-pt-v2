import { cn } from "@/lib/cn";
import type { PerfBar } from "@/lib/types";

export function BarChart({ bars, ariaLabel = "주간 수업 분포 막대 차트" }: { bars: PerfBar[]; ariaLabel?: string }) {
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-end justify-between gap-2">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            className={cn("w-full rounded-[5px]", b.emphasized ? "bg-sage" : "bg-bar-empty")}
            style={{ height: b.valuePx }}
          />
          <span className={cn("text-[10px]", b.emphasized ? "font-semibold text-sage-deep" : "font-medium text-muted4")}>
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}
