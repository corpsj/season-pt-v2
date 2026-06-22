import {
  getMemberCalendar,
  getMemberCalendarDayMap,
  getMemberChatUnread,
} from "@/lib/data/groups/member";
import { MemberCalendarClient } from "./ui";

export default async function MemberCalendarPage() {
  const view = await getMemberCalendar();
  const dayMap = await getMemberCalendarDayMap();
  const chatUnread = await getMemberChatUnread();
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
