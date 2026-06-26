import { getMe, getTrainerCalendarMonth, getChatUnread } from "@/lib/data/groups/trainer-home";
import { countUnread } from "@/lib/data/groups/notifications";
import TrainerCalendarClient from "./ui";

export default async function TrainerCalendarPage() {
  const [me, month, chatUnread] = await Promise.all([getMe(), getTrainerCalendarMonth(), getChatUnread()]);
  const notifUnread = me.trainerId ? await countUnread("trainer", me.trainerId) : 0;
  return (
    <TrainerCalendarClient
      me={me}
      base={month.base}
      classesByDate={month.classesByDate}
      todayISO={month.todayISO}
      chatUnread={chatUnread}
      notifUnread={notifUnread}
    />
  );
}
