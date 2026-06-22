import { getMemberMyPage, getMemberChatUnread } from "@/lib/data/groups/member";
import { MemberMyClient } from "./ui";

export default async function MemberMyPage() {
  const view = await getMemberMyPage();
  const chatUnread = await getMemberChatUnread();
  return <MemberMyClient view={view} chatUnread={chatUnread} />;
}
