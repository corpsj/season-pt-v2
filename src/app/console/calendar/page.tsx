import { Topbar } from "@/components/console/Topbar";
import { getStudioCalendarMonth, getStudioCalendarWeek } from "@/lib/data/groups/console";
import { CalendarClient } from "./ui";

export default async function ConsoleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const offset = Number(sp.m ?? "0") || 0;
  const [month, week] = await Promise.all([getStudioCalendarMonth(offset), getStudioCalendarWeek(0)]);

  return (
    <>
      <Topbar title="수업 캘린더" sub="전체 수업" />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <div className="mx-auto max-w-[1200px]">
          <CalendarClient month={month} initialWeek={week} />
        </div>
      </div>
    </>
  );
}
