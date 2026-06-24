import {
  getMemberCalendar,
  getMemberCalendarDayMap,
  getMemberChatUnread,
} from "@/lib/data/groups/member";
import { MemberCalendarClient } from "./ui";

export default async function MemberCalendarPage() {
  // Independent getters → run concurrently (each is its own Supabase round-trip chain).
  const [view, dayMap, chatUnread] = await Promise.all([
    getMemberCalendar(),
    getMemberCalendarDayMap(),
    getMemberChatUnread(),
  ]);
  const initialSelected = view.calDays.find((d) => d.selected)?.dateISO ?? view.calDays[0]?.dateISO ?? "";

  return (
    <MemberCalendarClient
      view={view}
      dayMap={dayMap}
      initialSelected={initialSelected}
      chatUnread={chatUnread}
    />
  );
}
