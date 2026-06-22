import { getMemberDetail, getMembershipProducts } from "@/lib/data/groups/owner-ops";
import { MembershipClient } from "./ui";

export default async function IssueMembershipPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const member = await getMemberDetail(id);
  const products = getMembershipProducts();
  return <MembershipClient member={member} products={products} />;
}
