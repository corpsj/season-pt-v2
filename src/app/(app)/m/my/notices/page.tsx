import { getMemberNotices } from "@/lib/data/groups/member";
import { MemberNoticesClient } from "./ui";

export default async function MemberNoticesPage() {
  const view = await getMemberNotices();
  return <MemberNoticesClient view={view} />;
}
