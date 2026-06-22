import { cn } from "@/lib/cn";

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "tappable flex-1 rounded-xl py-[10px] text-center text-[13px]",
            value === o.value ? "bg-sage font-bold text-surface" : "bg-sage-banner font-semibold text-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
