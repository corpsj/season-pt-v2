import { Topbar } from "@/components/console/Topbar";
import { requireOwnerPage } from "@/lib/auth/guard";
import { getSettlement } from "@/lib/data/groups/settlement";
import { SettlementClient } from "./ui";

export default async function ConsoleSettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.m) || 0);
  const settlement = await getSettlement(offset);

  return (
    <>
      <Topbar title="강사 정산" sub={`${settlement.monthLabel} · 회당 정산`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <SettlementClient settlement={settlement} />
      </div>
    </>
  );
}
