import { getMe, getTrainerCalendarMonth, getChatUnread } from "@/lib/data/groups/trainer-home";
import TrainerCalendarClient from "./ui";

export default async function TrainerCalendarPage() {
  const [me, month, chatUnread] = await Promise.all([getMe(), getTrainerCalendarMonth(), getChatUnread()]);
  return (
    <TrainerCalendarClient
      me={me}
      base={month.base}
      classesByDate={month.classesByDate}
      todayISO={month.todayISO}
      chatUnread={chatUnread}
    />
  );
}
