import { requireOwnerPage } from "@/lib/auth/guard";
import { getMembershipProducts, getStaff } from "@/lib/data/groups/owner-ops";
import { MemberRegisterClient } from "./ui";

export default async function MemberRegisterPage() {
  const t = await requireOwnerPage(); // 대표 전용
  const [products, staff] = await Promise.all([getMembershipProducts(), getStaff()]);
  return (
    <MemberRegisterClient
      ownerName={t.displayName}
      ownerId={t.id}
      products={products}
      staff={staff}
    />
  );
}
