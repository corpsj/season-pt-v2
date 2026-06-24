import { requireOwnerPage } from "@/lib/auth/guard";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import { PolicyClient } from "./ui";

export default async function PolicyPage() {
  await requireOwnerPage();
  const settings = await getStudioSettings();
  return <PolicyClient settings={settings} />;
}
