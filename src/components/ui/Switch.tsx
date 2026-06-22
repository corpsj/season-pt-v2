import { cn } from "@/lib/cn";

/** iOS-style toggle (46×27). Matches the .toggle/.knob spec from the design. */
export function Switch({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "tappable flex h-[27px] w-[46px] flex-none items-center rounded-[14px] p-[3px]",
        on ? "justify-end bg-sage" : "justify-start bg-[#d8d2c6]",
        disabled && "opacity-60"
      )}
    >
      <span
        className="h-[21px] w-[21px] rounded-full bg-white"
        style={{ boxShadow: "0 1px 3px rgba(38,35,30,.25)" }}
      />
    </button>
  );
}
