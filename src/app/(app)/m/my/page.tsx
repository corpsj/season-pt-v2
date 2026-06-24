import { getMemberMyPage, getMemberChatUnread } from "@/lib/data/groups/member";
import { MemberMyClient } from "./ui";

export default async function MemberMyPage() {
  const [view, chatUnread] = await Promise.all([
    getMemberMyPage(),
    getMemberChatUnread(),
  ]);
  return <MemberMyClient view={view} chatUnread={chatUnread} />;
}
