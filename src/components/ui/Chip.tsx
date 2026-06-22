import { cn } from "@/lib/cn";

export function Chip({
  selected,
  tone = "default",
  children,
  onClick,
  className,
}: {
  selected?: boolean;
  tone?: "default" | "expiring";
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const style = selected
    ? "bg-sage text-surface font-bold"
    : tone === "expiring"
      ? "bg-warm-banner text-terracotta-link border border-terracotta/25 font-semibold"
      : "bg-card text-muted5 border border-ink/10 font-semibold";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("tappable rounded-[20px] px-[13px] py-[7px] text-[12px] leading-none", style, className)}
    >
      {children}
    </button>
  );
}
