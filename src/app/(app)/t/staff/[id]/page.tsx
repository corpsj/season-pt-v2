import { redirect } from "next/navigation";
import { getStaffMember } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import { StaffDetailClient } from "./ui";

export default async function StaffDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireOwnerPage(); // 대표 전용
  const { id } = await props.params;
  const member = await getStaffMember(id);
  if (!member) redirect("/t/staff");
  return <StaffDetailClient member={member} />;
}
