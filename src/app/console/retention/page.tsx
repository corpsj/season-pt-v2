import { Topbar } from "@/components/console/Topbar";
import { requireOwnerPage } from "@/lib/auth/guard";
import { getRetention } from "@/lib/data/groups/perf-retention";
import RetentionConsole from "./ui";

export default async function ConsoleRetentionPage() {
  await requireOwnerPage(); // 대표 전용
  const view = await getRetention();

  return (
    <>
      <Topbar title="재등록 관리" sub={`14일 이내 만료 임박 ${view.expiringCount}명`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-11 pt-[30px]">
        <div className="mx-auto max-w-[900px]">
          <RetentionConsole view={view} />
        </div>
      </div>
    </>
  );
}
