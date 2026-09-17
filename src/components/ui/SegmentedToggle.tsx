import { cn } from "@/lib/cn";

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const groupLabel = ariaLabel ?? `${options.map((option) => option.label).join(" / ")} 선택`;
  return (
    <div role="group" aria-label={groupLabel} className={cn("flex gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "tappable relative flex-1 rounded-xl py-[10px] text-center text-[13px] after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
            value === o.value ? "bg-sage font-bold text-surface" : "bg-sage-banner font-semibold text-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
