import { Topbar } from "@/components/console/Topbar";
import { getStudioCalendarMonth } from "@/lib/data/groups/console";
import { CalendarClient } from "./ui";

export default async function ConsoleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const offset = Number(sp.m ?? "0") || 0;
  const month = await getStudioCalendarMonth(offset);

  return (
    <>
      <Topbar title="수업 캘린더" sub={`${month.monthLabel} · 스튜디오 전체 수업`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <CalendarClient month={month} />
      </div>
    </>
  );
}
