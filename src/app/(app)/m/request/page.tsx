import { getMemberRequest, getMemberRequestMeta } from "@/lib/data/groups/member";
import { MemberRequestClient } from "./ui";

export default async function MemberRequestPage() {
  const view = await getMemberRequest();
  const meta = await getMemberRequestMeta();

  return <MemberRequestClient view={view} slotIsoById={meta.slotIsoById} />;
}
