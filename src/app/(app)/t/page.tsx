import { getMe, getTrainerCalendarMonth, getChatUnread } from "@/lib/data/groups/trainer-home";
import { countUnread, scanExpiringMemberships } from "@/lib/data/groups/notifications";
import { runStudioMaintenance } from "@/lib/data/groups/maintenance";
import TrainerCalendarClient from "./ui";

export default async function TrainerCalendarPage() {
  const [me, month, chatUnread] = await Promise.all([getMe(), getTrainerCalendarMonth(), getChatUnread()]);
  await runStudioMaintenance(); // best-effort: expire past memberships + materialize upcoming sessions
  await scanExpiringMemberships().catch(() => {}); // ponytail: dedup-guarded best-effort on owner home load; move to pg_cron if membership count grows
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
