import { requireOwnerPage } from "@/lib/auth/guard";
import { getMemberDetail } from "@/lib/data/groups/trainer-home";
import { getTeamCandidates, getMemberSchedule } from "@/lib/data/groups/owner-ops";
import { TeamCreateClient } from "./ui";

export default async function MemberTeamPage(props: { params: Promise<{ id: string }> }) {
  await requireOwnerPage(); // 대표 전용
  const { id } = await props.params;
  const [m, sched] = await Promise.all([getMemberDetail(id), getMemberSchedule(id)]);

  // 이미 활성 2:1 팀이면 편집 모드(일정 변경·해제). 아니면 만들기 모드.
  const teamSlots = sched.slots.filter((s) => s.type === "2on1");
  if (teamSlots.length > 0) {
    return (
      <TeamCreateClient
        memberId={id}
        memberName={m.name}
        candidates={[]}
        mode="edit"
        partnerName={teamSlots[0].partnerName}
        initialSlots={teamSlots.map((s) => ({ weekday: s.weekday, hour: s.hour, minute: s.minute }))}
      />
    );
  }
  const candidates = await getTeamCandidates(id);
  return <TeamCreateClient memberId={id} memberName={m.name} candidates={candidates} mode="create" />;
}
