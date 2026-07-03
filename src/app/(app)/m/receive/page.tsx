import { getMemberReceiveList } from "@/lib/data/groups/member";
import { MemberReceiveClient } from "./ui";

export default async function MemberReceivePage() {
  const items = await getMemberReceiveList();
  return <MemberReceiveClient items={items} />;
}
