import { cn } from "@/lib/cn";

export function ProgressBar({
  pct,
  track = "bg-ink/[0.06]",
  fill = "bg-progress",
  animate = true,
  className,
}: {
  pct: number;
  track?: string;
  fill?: string;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full", track, className)}>
      <div
        className={cn("h-full rounded-full", fill, animate && "pt-grow")}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
