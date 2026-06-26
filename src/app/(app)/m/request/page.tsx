import { getMemberRequest } from "@/lib/data/groups/member";
import { MemberRequestClient } from "./ui";

export default async function MemberRequestPage(props: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await props.searchParams;
  const view = await getMemberRequest(s);
  return <MemberRequestClient view={view} />;
}
