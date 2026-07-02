import { redirect } from "next/navigation";
import { getStaffMember, getStaff } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import { StaffDetailClient } from "./ui";

export default async function StaffDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireOwnerPage(); // 대표 전용
  const { id } = await props.params;
  const member = await getStaffMember(id);
  if (!member) redirect("/t/staff");
  // 회원 이관(퇴사 인수인계) 대상: 이 강사를 제외한 활성 강사·대표(감사 H4).
  const staff = await getStaff();
  const reassignTargets = staff
    .filter((s) => s.id !== id && (s.role === "instructor" || s.role === "owner"))
    .map((s) => ({ id: s.id, name: s.name }));
  return <StaffDetailClient member={member} reassignTargets={reassignTargets} />;
}
