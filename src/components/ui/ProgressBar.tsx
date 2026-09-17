import { cn } from "@/lib/cn";

export function ProgressBar({
  pct,
  track = "bg-ink/[0.06]",
  fill = "bg-progress",
  animate = true,
  className,
  label = "진행률",
  valueText,
}: {
  pct: number;
  track?: string;
  fill?: string;
  animate?: boolean;
  className?: string;
  label?: string;
  valueText?: string;
}) {
  const value = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn("h-2 w-full overflow-hidden rounded-full", track, className)}
    >
      <div
        className={cn("h-full rounded-full", fill, animate && "pt-grow")}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
