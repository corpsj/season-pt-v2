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

/** 전화번호 표시용 하이픈: 01012345678 → 010-1234-5678 */
export function formatPhone(digits: string) {
  const d = digits.replace(/[^\d]/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 전화번호 입력: 입력하는 대로 하이픈이 붙는다. 상태에는 숫자만 전달. */
export function PhoneInput({
  value,
  onValueChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** 숫자만 담긴 문자열 (예: "01012345678") */
  value: string;
  onValueChange: (digits: string) => void;
}) {
  return (
    <TextInput
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      {...props}
      value={formatPhone(value)}
      onChange={(e) => onValueChange(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
    />
  );
}

/** 금액 입력: 화면에는 천단위 콤마(1,000,000), 상태에는 숫자만 전달한다. */
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** 숫자만 담긴 문자열 (예: "50000") */
  value: string;
  onValueChange: (digits: string) => void;
}) {
  const digits = value.replace(/[^\d]/g, "");
  return (
    <TextInput
      inputMode="numeric"
      autoComplete="off"
      {...props}
      value={digits ? Number(digits).toLocaleString("ko-KR") : ""}
      onChange={(e) => onValueChange(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
    />
  );
}
