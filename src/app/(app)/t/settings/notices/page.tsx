import { requireOwnerPage } from "@/lib/auth/guard";
import { getStudioNotices } from "@/lib/data/groups/owner-ops";
import { NoticesClient } from "./ui";

export default async function NoticesSettingsPage() {
  await requireOwnerPage(); // 대표 전용
  const notices = await getStudioNotices();
  return <NoticesClient notices={notices} />;
}
