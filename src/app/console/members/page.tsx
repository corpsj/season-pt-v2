import { Topbar } from "@/components/console/Topbar";
import { getMembersAll, getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getMembershipProducts, getAssignableTrainers } from "@/lib/data/groups/owner-ops";
import { getMemberFiles } from "@/lib/data/groups/member-files";
import { getMemberMeals } from "@/lib/data/groups/meals";
import { MembersClient } from "./ui";

export default async function ConsoleMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ sel?: string }>;
}) {
  const sp = await searchParams;
  const [{ view, statusById }, products, trainers] = await Promise.all([
    getMembersAll(),
    getMembershipProducts(),
    getAssignableTrainers(),
  ]);
  const initialId = sp.sel ?? view.items[0]?.id ?? null;
  const [initialDetail, initialFiles, initialMeals] = initialId
    ? await Promise.all([getMemberDetail(initialId), getMemberFiles(initialId), getMemberMeals(initialId)])
    : [null, [], { meals: [], hasMore: false }];

  return (
    <>
      <Topbar title="회원 관리" sub={`전체 ${view.totals.total}명 · 만료 임박 ${view.totals.expiring}명 · 휴면 ${view.totals.rest}명`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <div className="mx-auto max-w-[1200px]">
        <MembersClient
          items={view.items}
          statusById={statusById}
          products={products}
          trainers={trainers}
          initialId={initialId}
          initialDetail={initialDetail}
          initialFiles={initialFiles}
          initialMeals={initialMeals.meals}
        />
        </div>
      </div>
    </>
  );
}
