import { redirect } from "next/navigation";
import { requireOwnerPage } from "@/lib/auth/guard";
import { getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getTeamCandidates } from "@/lib/data/groups/owner-ops";
import { TeamCreateClient } from "./ui";

export default async function MemberTeamPage(props: { params: Promise<{ id: string }> }) {
  await requireOwnerPage(); // 대표 전용
  const { id } = await props.params;
  const [m, candidates] = await Promise.all([getMemberDetail(id), getTeamCandidates(id)]);
  // 이미 2:1 팀인 회원은 재구성 불가(고정 페어) — 상세로 돌려보낸다.
  if (m.isTeam) redirect(`/t/members/${id}`);
  return <TeamCreateClient memberId={id} memberName={m.name} candidates={candidates} />;
}
