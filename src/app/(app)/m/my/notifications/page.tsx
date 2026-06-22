import { getMemberNotifSettings } from "@/lib/data/groups/member";
import { MemberNotifClient } from "./ui";

export default async function MemberNotificationsPage() {
  const view = await getMemberNotifSettings();
  return <MemberNotifClient view={view} />;
}
