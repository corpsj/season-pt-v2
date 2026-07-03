import { requireOwnerPage } from "@/lib/auth/guard";
import { getMembershipProducts, getAssignableTrainers } from "@/lib/data/groups/owner-ops";
import { MemberRegisterClient } from "./ui";

export default async function MemberRegisterPage() {
  const t = await requireOwnerPage(); // 대표 전용
  // 배정 가능한 강사 = 비활성 제외(명단만 등록된 로그인 미발급 강사 포함) — 콘솔 등록과 동일 기준.
  const [products, trainers] = await Promise.all([
    getMembershipProducts(),
    getAssignableTrainers(),
  ]);
  return (
    <MemberRegisterClient
      ownerId={t.id}
      products={products}
      trainers={trainers}
    />
  );
}
