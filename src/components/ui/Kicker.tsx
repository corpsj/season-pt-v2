import { cn } from "@/lib/cn";

/** Section label (.kick): 12px 600 uppercase, +0.08em tracking. */
export function Kicker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-[12px] font-semibold uppercase tracking-[0.08em] text-muted3", className)}>
      {children}
    </div>
  );
}
