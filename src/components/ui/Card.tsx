import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[18px] border border-ink/[0.055] bg-card shadow-card", className)}>
      {children}
    </div>
  );
}
