import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** Selectable row (attend method / time slot / membership product). */
export function RadioOption({
  selected,
  onClick,
  shape = "circle",
  children,
  right,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  shape?: "circle" | "square";
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tappable flex w-full items-center gap-3 rounded-[14px] px-4 py-3.5 text-left",
        selected ? "border-[1.5px] border-sage bg-sage-banner2" : "border border-ink/[0.08] bg-card",
        className
      )}
    >
      <span
        className={cn(
          "flex h-[22px] w-[22px] flex-none items-center justify-center",
          shape === "circle" ? "rounded-full" : "rounded-md",
          selected ? "bg-sage" : "border-2 border-stroke-disabled"
        )}
      >
        {selected ? <Icon name="check-bold" size={14} className="text-surface" /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {right}
    </button>
  );
}
