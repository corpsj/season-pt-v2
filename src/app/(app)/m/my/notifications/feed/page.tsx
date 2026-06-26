import { getMemberContext } from "@/lib/data/db";
import { getNotifications } from "@/lib/data/groups/notifications";
import { MemberNotifFeedClient } from "./ui";

export default async function MemberNotifFeedPage() {
  const ctx = await getMemberContext();
  const items = ctx ? await getNotifications("member", ctx.memberId) : [];
  return <MemberNotifFeedClient items={items} />;
}
