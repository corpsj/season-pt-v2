import {
  getMemberCalendar,
  getMemberCalendarDayMap,
  getMemberChatUnread,
} from "@/lib/data/groups/member";
import { todayISO } from "@/lib/data/db";
import { MemberCalendarClient } from "./ui";

export default async function MemberCalendarPage(props: {
  searchParams: Promise<{ m?: string }>;
}) {
  // ?m=YYYY-MM 으로 월 이동 — 다음 달 수업을 볼 수도, 변경 요청도 못 하던 문제(감사 #26).
  const { m } = await props.searchParams;
  const monthKey = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : todayISO().slice(0, 7);
  const iso = monthKey === todayISO().slice(0, 7) ? undefined : `${monthKey}-01`;

  // Independent getters → run concurrently (each is its own Supabase round-trip chain).
  const [view, dayMap, chatUnread] = await Promise.all([
    getMemberCalendar(iso),
    getMemberCalendarDayMap(iso),
    getMemberChatUnread(),
  ]);
  const initialSelected = view.calDays.find((d) => d.selected)?.dateISO ?? view.calDays[0]?.dateISO ?? "";

  const [y, mo] = monthKey.split("-").map(Number);
  const prevM = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  const nextM = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;

  return (
    <MemberCalendarClient
      view={view}
      dayMap={dayMap}
      initialSelected={initialSelected}
      chatUnread={chatUnread}
      prevM={prevM}
      nextM={nextM}
      today={todayISO()}
    />
  );
}
