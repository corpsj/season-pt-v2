import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import type { BadgeVariant } from "@/lib/types";

const STYLES: Record<BadgeVariant, string> = {
  active: "text-green-active bg-green-active-bg",
  expiringNear: "text-surface bg-terracotta",
  expiringSoon: "text-gold-pending bg-gold-pending-bg",
  changeReq: "text-sage-deep bg-sage-banner2",
  cancelReq: "text-terracotta-link bg-warm-banner",
  scheduled: "text-sage-deep bg-sage-banner2",
  team: "text-info-accent bg-info-bg",
  done: "text-sage-soft bg-sage-banner2",
  cancelled: "text-muted2 bg-sage-banner2",
  awaiting: "text-gold-pending bg-gold-pending-bg",
  owner: "text-gold bg-gold-bg",
  instructor: "text-green-active bg-green-active-bg",
  invited: "text-gold-pending bg-gold-pending-bg",
  remaining: "text-[#5b6452] bg-sage-banner2",
  recommended: "text-surface bg-sage",
};

export function Badge({
  variant,
  children,
  icon,
  className,
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold leading-none",
        STYLES[variant],
        className
      )}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
