import { getMe, getMembersAll, getChatUnread } from "@/lib/data/groups/trainer-home";
import MembersClient from "./ui";

export default async function MembersPage() {
  const [me, members, chatUnread] = await Promise.all([getMe(), getMembersAll(), getChatUnread()]);
  return <MembersClient me={me} view={members.view} statusById={members.statusById} chatUnread={chatUnread} />;
}
