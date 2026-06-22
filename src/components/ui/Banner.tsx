import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import type { BannerTone } from "@/lib/types";

const TONES: Record<BannerTone, { bg: string; icon: string; text: string; defaultIcon: IconName }> = {
  neutral: { bg: "bg-sage-banner", icon: "text-muted3", text: "text-muted2", defaultIcon: "circle-info" },
  warn: { bg: "bg-warm-banner", icon: "text-terracotta", text: "text-[#9a7b66]", defaultIcon: "circle-info" },
  positive: { bg: "bg-sage-banner2", icon: "text-sage-deep", text: "text-[#5b6452]", defaultIcon: "circle-info" },
  team: { bg: "bg-info-bg", icon: "text-info-accent", text: "text-info-ink", defaultIcon: "persons-fill" },
  owner: { bg: "bg-gold-bg", icon: "text-gold", text: "text-ink-soft", defaultIcon: "crown-fill" },
};

export function Banner({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BannerTone;
  icon?: IconName;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-[13px] px-[15px] py-[13px]", t.bg, className)}>
      <Icon name={icon ?? t.defaultIcon} size={17} className={cn("mt-px flex-none", t.icon)} />
      <span className={cn("text-[12px] font-medium leading-[1.5]", t.text)}>{children}</span>
    </div>
  );
}
