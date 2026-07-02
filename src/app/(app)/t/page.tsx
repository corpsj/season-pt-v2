import { getMe, getTrainerCalendarData, getChatUnread } from "@/lib/data/groups/trainer-home";
import { countUnread, scanExpiringMemberships } from "@/lib/data/groups/notifications";
import { runStudioMaintenance } from "@/lib/data/groups/maintenance";
import TrainerCalendarClient from "./ui";

export default async function TrainerCalendarPage(props: {
  searchParams: Promise<{ v?: string; d?: string }>;
}) {
  // ?v=m|w (월간/주간) + ?d=YYYY-MM-DD (기간 앵커) — 기간 이동·뷰 전환은 URL 라운드트립.
  const { v, d } = await props.searchParams;
  const view = v === "w" ? "week" : "month";
  const [me, cal, chatUnread] = await Promise.all([getMe(), getTrainerCalendarData(view, d), getChatUnread()]);
  await runStudioMaintenance(); // best-effort: expire past memberships + materialize upcoming sessions
  await scanExpiringMemberships().catch(() => {}); // ponytail: dedup-guarded best-effort on owner home load; move to pg_cron if membership count grows
  const notifUnread = me.trainerId ? await countUnread("trainer", me.trainerId) : 0;
  return (
    // key: 기간/뷰가 바뀌면 클라이언트 섬 리마운트 — 이전 기간의 선택일 상태가 새 기간에 남지 않게.
    <TrainerCalendarClient
      key={`${view}:${cal.periodLabel}`}
      me={me}
      cal={cal}
      chatUnread={chatUnread}
      notifUnread={notifUnread}
    />
  );
}
