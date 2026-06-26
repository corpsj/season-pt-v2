import { getMemberRequest } from "@/lib/data/groups/member";
import { MemberRequestClient } from "./ui";

export default async function MemberRequestPage() {
  const view = await getMemberRequest();
  return <MemberRequestClient view={view} />;
}
