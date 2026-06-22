import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/** Form field chrome: label above, a white rounded row with a left sage icon.
 *  Pass an <input> (or a display value) as children. */
export function Field({
  icon,
  label,
  hint,
  children,
  className,
  rowClassName,
}: {
  icon?: IconName;
  label?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={className}>
      {label ? <div className="mb-2 text-[12.5px] font-semibold text-muted5">{label}</div> : null}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-4 py-[15px]",
          rowClassName
        )}
      >
        {icon ? <Icon name={icon} size={19} className="flex-none text-sage-soft" /> : null}
        <div className="min-w-0 flex-1">{children}</div>
        {hint ? <span className="ml-auto flex-none text-[12px] font-medium text-placeholder">{hint}</span> : null}
      </div>
    </div>
  );
}

/** Bare text input styled for use inside <Field>. */
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder",
        props.className
      )}
    />
  );
}
