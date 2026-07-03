import type { TabDef } from "@/components/shell/TabBar";

export function trainerTabs({
  isOwner,
  chatUnread,
}: {
  isOwner: boolean;
  chatUnread: number;
}): TabDef[] {
  const tabs: TabDef[] = [
    { label: "캘린더", href: "/t", icon: "calendar", activeIcon: "calendar-fill", matchExact: true },
    { label: "회원", href: "/t/members", icon: "persons", activeIcon: "persons-fill" },
    { label: "채팅", href: "/t/chat", icon: "message", activeIcon: "message-fill", badge: chatUnread || undefined },
  ];
  if (isOwner) tabs.push({ label: "운영", href: "/t/perf", icon: "home", activeIcon: "home-fill" });
  else tabs.push({ label: "내 현황", href: "/t/stats", icon: "chart", activeIcon: "chart" });
  return tabs;
}

export function memberTabs({ chatUnread }: { chatUnread: number }): TabDef[] {
  return [
    { label: "캘린더", href: "/m", icon: "calendar", activeIcon: "calendar-fill", matchExact: true },
    { label: "채팅", href: "/m/chat", icon: "message", activeIcon: "message-fill", badge: chatUnread || undefined },
    { label: "마이", href: "/m/my", icon: "person", activeIcon: "person-fill" },
  ];
}
