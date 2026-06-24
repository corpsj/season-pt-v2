import { requireOwnerPage } from "@/lib/auth/guard";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import { NotificationsClient } from "./ui";

export default async function NotificationsPage() {
  await requireOwnerPage();
  const settings = await getStudioSettings();
  return <NotificationsClient settings={settings} />;
}
