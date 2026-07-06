import { getMemberDetail, getMembershipProducts, getMemberRenewableProducts } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import { MembershipClient } from "./ui";

export default async function IssueMembershipPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireOwnerPage(); // 대표 전용
  const { id } = await props.params;
  const [member, active, renewable] = await Promise.all([
    getMemberDetail(id),
    getMembershipProducts(),
    getMemberRenewableProducts(id), // 이 회원이 쓰던 단종 상품(연장 전용)
  ]);
  // 판매 중 상품 + 이 회원이 보유한 단종 상품. 신규 회원 등록 화면은 active만 써 단종은 계속 숨겨짐.
  return <MembershipClient member={member} products={[...active, ...renewable]} />;
}
