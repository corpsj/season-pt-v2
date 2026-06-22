import { getMemberReceive, getMemberReceiveMeta } from "@/lib/data/groups/member";
import { MemberReceiveClient } from "./ui";

export default async function MemberReceivePage() {
  const view = await getMemberReceive();
  const meta = await getMemberReceiveMeta();

  return (
    <MemberReceiveClient view={view} requestId={meta.requestId} slotIsoById={meta.slotIsoById} />
  );
}
