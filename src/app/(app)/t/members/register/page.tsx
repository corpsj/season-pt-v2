import { requireOwnerPage } from "@/lib/auth/guard";
import { MemberRegisterClient } from "./ui";

export default async function MemberRegisterPage() {
  const t = await requireOwnerPage(); // 대표 전용
  return <MemberRegisterClient ownerName={t.displayName} />;
}
