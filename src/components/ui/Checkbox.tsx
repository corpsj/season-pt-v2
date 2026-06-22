import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** Standalone checkbox glyph (square). */
export function Checkbox({ checked, className }: { checked?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md",
        checked ? "bg-sage" : "border-2 border-stroke-disabled",
        className
      )}
    >
      {checked ? <Icon name="check-bold" size={14} className="text-surface" /> : null}
    </span>
  );
}
