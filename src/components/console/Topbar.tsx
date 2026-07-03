import { Icon } from "@/components/ui/icon";
import { getTrainerContext } from "@/lib/data/db";
import { getNotifications, countUnread } from "@/lib/data/groups/notifications";
import { kstTodayLabel } from "./ui";
import { BellMenu } from "./BellMenu";
import { SearchBox } from "./SearchBox";

/** Console page header: per-page title/sub on the left, today + bell on the right. */
export function Topbar({
  title,
  sub,
  right,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-none items-center gap-[18px] border-b border-[rgba(75,59,46,0.07)] bg-[#F4EFE6] px-[34px] pb-[18px] pt-5">
      <div className="min-w-0 flex-1">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {sub ? <div className="mt-1 text-[13px] font-medium text-[#9A917F]">{sub}</div> : null}
      </div>
      {right}
      <SearchBox />
      <div className="flex flex-none items-center gap-[7px] rounded-[11px] border border-[rgba(75,59,46,0.07)] bg-white px-[14px] py-[9px]">
        <Icon name="calendar" size={16} className="text-[#8FA187]" />
        <span className="text-[13px] font-semibold text-[#5B5345]">{kstTodayLabel()}</span>
      </div>
      <BellSlot />
    </header>
  );
}

/** Self-contained bell: resolves the owner + their in-app notifications server-side. */
async function BellSlot() {
  const t = await getTrainerContext();
  if (!t) return null;
  const [items, unread] = await Promise.all([
    getNotifications("trainer", t.id),
    countUnread("trainer", t.id),
  ]);
  return <BellMenu items={items} unread={unread} />;
}
