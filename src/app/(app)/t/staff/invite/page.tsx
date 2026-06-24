import { requireOwnerPage } from "@/lib/auth/guard";
import { StaffInviteClient } from "./ui";

export default async function StaffInvitePage() {
  await requireOwnerPage(); // 대표 전용
  return <StaffInviteClient />;
}
