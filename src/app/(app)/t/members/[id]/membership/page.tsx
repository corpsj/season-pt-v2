import { getMemberDetail, getMembershipProducts } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import { MembershipClient } from "./ui";

export default async function IssueMembershipPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireOwnerPage(); // 대표 전용
  const { id } = await props.params;
  const member = await getMemberDetail(id);
  const products = getMembershipProducts();
  return <MembershipClient member={member} products={products} />;
}
