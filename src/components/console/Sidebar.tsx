"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { trainerLogout } from "@/lib/auth/trainer-actions";

type NavItem = { key: string; label: string; href: string; icon: IconName; activeIcon: IconName; badgeKey?: "members" | "requests" | "messages" };

// 일상 운영(매일 확인) → 사람 관리 → 재무(수입→지급→손익) → 설정 순.
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    label: "운영",
    items: [
      { key: "dashboard", label: "운영 현황", href: "/console", icon: "home", activeIcon: "home-fill" },
      { key: "calendar", label: "수업 캘린더", href: "/console/calendar", icon: "calendar", activeIcon: "calendar-fill" },
      { key: "requests", label: "일정 조율", href: "/console/requests", icon: "document-text", activeIcon: "document-text", badgeKey: "requests" },
      { key: "messages", label: "메시지", href: "/console/messages", icon: "message", activeIcon: "message-fill", badgeKey: "messages" },
    ],
  },
  {
    label: "관리",
    items: [
      { key: "members", label: "회원", href: "/console/members", icon: "person", activeIcon: "person-fill", badgeKey: "members" },
      { key: "trainers", label: "강사", href: "/console/trainers", icon: "persons", activeIcon: "persons-fill" },
    ],
  },
  {
    label: "재무",
    items: [
      { key: "revenue", label: "매출 현황", href: "/console/revenue", icon: "coins", activeIcon: "coins-fill" },
      { key: "settlement", label: "강사 정산", href: "/console/settlement", icon: "tag", activeIcon: "tag-fill" },
      { key: "finance", label: "손익", href: "/console/finance", icon: "chart", activeIcon: "chart-fill" },
    ],
  },
  {
    items: [{ key: "settings", label: "설정", href: "/console/settings", icon: "setting", activeIcon: "setting" }],
  },
];

export function Sidebar({
  ownerName,
  badges,
}: {
  ownerName: string;
  badges: { members: number; requests: number; messages: number };
}) {
  const pathname = usePathname();
  return (
    <aside className="flex w-[248px] flex-none flex-col bg-frame px-4 pb-[18px] pt-[22px]">
      {/* brand */}
      <div className="mb-[30px] flex items-center gap-[11px] px-2 pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-192.png" alt="계절 PT" width={40} height={40} className="block flex-none rounded-[9px]" />
        <div className="min-w-0">
          <div className="whitespace-nowrap text-[15px] font-bold tracking-[-0.01em] text-surface">계절 PT &amp; 필라테스</div>
          <div className="mt-0.5 text-[12px] font-medium leading-tight text-[#9B8F7C]">운영 콘솔</div>
        </div>
      </div>

      <nav className="flex flex-col">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.label ?? gi} className={gi > 0 ? "mt-[14px]" : ""}>
            {g.label ? (
              <div className="px-[10px] pb-[7px] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6F6655]">{g.label}</div>
            ) : null}
            <div className="flex flex-col gap-[3px]">
              {g.items.map((it) => {
                const on = it.href === "/console" ? pathname === "/console" : pathname.startsWith(it.href);
                const badge = it.badgeKey ? badges[it.badgeKey] : 0;
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={`flex items-center gap-3 rounded-[12px] px-[13px] py-[11px] text-[14px] font-semibold tracking-[-0.01em] transition-colors ${
                      on ? "bg-sage text-surface" : "text-[#AEA08D] hover:bg-[rgba(250,248,244,0.07)]"
                    }`}
                  >
                    <Icon name={on ? it.activeIcon : it.icon} size={19} />
                    <span className="flex-1">{it.label}</span>
                    {badge > 0 ? (
                      <span
                        className="min-w-[18px] rounded-full px-[7px] text-center text-[10.5px] font-bold"
                        style={{
                          color: on ? "#FAF8F4" : "#C67352",
                          background: on ? "rgba(250,248,244,.18)" : "#3A332B",
                        }}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* owner footer */}
      <div className="mt-auto">
        <div className="mx-2 my-[14px] h-px bg-[rgba(250,248,244,0.08)]" />
        <div className="flex items-center gap-[11px] rounded-[13px] bg-[rgba(250,248,244,0.05)] px-[10px] py-[9px]">
          <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-sage text-[15px] font-semibold text-surface">
            {ownerName.charAt(0) || "대"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[5px]">
              <span className="truncate text-[13.5px] font-semibold text-surface">{ownerName || "대표"}</span>
              <Icon name="crown-fill" size={12} className="flex-none text-[#D9B96B]" />
            </div>
            <div className="text-[11px] font-medium text-[#928771]">대표 트레이너</div>
          </div>
          <button
            type="button"
            aria-label="로그아웃"
            onClick={() => trainerLogout().then(() => (window.location.href = "/console"))}
            className="flex-none text-[#6F6655] transition-colors hover:text-[#AEA08D]"
          >
            <Icon name="login" size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
