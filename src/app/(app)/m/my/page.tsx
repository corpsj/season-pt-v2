import { getMemberMyPage, getMemberChatUnread } from "@/lib/data/groups/member";
import { getMemberContext } from "@/lib/data/db";
import { countUnread } from "@/lib/data/groups/notifications";
import { MemberMyClient } from "./ui";

export default async function MemberMyPage() {
  const [view, chatUnread] = await Promise.all([getMemberMyPage(), getMemberChatUnread()]);
  const ctx = await getMemberContext(); // cache-hit — already called inside getMemberMyPage
  const notifUnread = ctx ? await countUnread("member", ctx.memberId) : 0;
  return <MemberMyClient view={view} chatUnread={chatUnread} notifUnread={notifUnread} />;
}
