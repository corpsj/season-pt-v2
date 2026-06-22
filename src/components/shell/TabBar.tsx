"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

export type TabDef = {
  label: string;
  icon: IconName;
  activeIcon: IconName;
  href?: string;
  /** tabs without a route show this toast instead (serializable, no fn prop). */
  toast?: string;
  badge?: number;
  matchExact?: boolean;
};

export function TabBar({ tabs }: { tabs: TabDef[] }) {
  const pathname = usePathname();
  const showToast = useToast();
  return (
    <nav className="flex flex-none border-t border-ink/[0.07] bg-surface/95 px-3 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))]">
      {tabs.map((t) => {
        const active = t.href
          ? t.matchExact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(t.href + "/")
          : false;
        const tone = active ? "text-sage-deep" : "text-placeholder";
        const inner = (
          <>
            <span className="relative leading-none">
              <Icon name={active ? t.activeIcon : t.icon} size={23} />
              {t.badge ? (
                <span className="absolute -right-1.5 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-lg bg-terracotta px-1 text-[9.5px] font-bold text-surface">
                  {t.badge}
                </span>
              ) : null}
            </span>
            <span className={cn("text-[11px]", active ? "font-semibold" : "font-medium")}>{t.label}</span>
          </>
        );
        const cls = cn("tappable flex flex-1 flex-col items-center gap-1 active:scale-90", tone);
        return t.href ? (
          <Link key={t.label} href={t.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={t.label} type="button" onClick={() => t.toast && showToast(t.toast)} className={cls}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
