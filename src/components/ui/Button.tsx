import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

type BaseProps = {
  children: React.ReactNode;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
};

function Base({ children, icon, href, onClick, type = "button", disabled, className, base }: BaseProps & { base: string }) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </>
  );
  const cls = cn(base, className);
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(cls, disabled && "opacity-50")}>
      {content}
    </button>
  );
}

const PRIMARY =
  "tappable flex h-[52px] w-full items-center justify-center gap-[7px] rounded-[15px] bg-sage text-[16px] font-semibold tracking-[0.01em] text-surface hover:brightness-105";
const OUTLINE =
  "tappable flex h-[52px] w-full items-center justify-center gap-[7px] rounded-[15px] border-[1.5px] border-sage-deep/45 bg-transparent text-[16px] font-semibold text-sage-deep hover:bg-sage/[0.07]";

export function PrimaryButton(props: BaseProps) {
  return <Base {...props} base={PRIMARY} />;
}
export function OutlineButton(props: BaseProps) {
  return <Base {...props} base={OUTLINE} />;
}
