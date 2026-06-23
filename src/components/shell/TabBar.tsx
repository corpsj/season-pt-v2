"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { pollChatUnread } from "@/lib/data/groups/chat-actions";
import { usePolling } from "@/lib/hooks/usePolling";
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

export function TabBar({ tabs, liveChat = false }: { tabs: TabDef[]; liveChat?: boolean }) {
  const pathname = usePathname();
  const showToast = useToast();
  const initialUnread = tabs.find((t) => t.href?.endsWith("/chat"))?.badge ?? 0;
  const [liveUnread, setLiveUnread] = useState<number>(initialUnread);

  usePolling(
    async () => {
      try {
        setLiveUnread(await pollChatUnread());
      } catch {
        // keep last value on transient failure
      }
    },
    5000,
    liveChat
  );

  const effectiveTabs = liveChat
    ? tabs.map((t) =>
        t.href?.endsWith("/chat") ? { ...t, badge: liveUnread || undefined } : t
      )
    : tabs;

  return (
    <nav className="flex flex-none border-t border-ink/[0.07] bg-surface/95 px-3 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))]">
      {effectiveTabs.map((t) => {
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
