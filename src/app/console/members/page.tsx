import { Topbar } from "@/components/console/Topbar";
import { getMembersAll, getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getMembershipProducts, getAllProducts, getAssignableTrainers } from "@/lib/data/groups/owner-ops";
import { getTrainerContext } from "@/lib/data/db";
import { getMemberFiles } from "@/lib/data/groups/member-files";
import { getMemberMeals } from "@/lib/data/groups/meals";
import { MembersClient } from "./ui";

export default async function ConsoleMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ sel?: string }>;
}) {
  const sp = await searchParams;
  const [{ view, statusById }, products, allProducts, trainers, t] = await Promise.all([
    getMembersAll(),
    getMembershipProducts(),
    getAllProducts(), // 한꺼번에 입력(기존 회원 승계)에서 단종 상품까지 선택 가능하게
    getAssignableTrainers(),
    getTrainerContext(), // 레이아웃이 대표를 보장 — 등록 모달 담당 강사 기본값용
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
          allProducts={allProducts}
          trainers={trainers}
          ownerId={t?.id ?? ""}
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
