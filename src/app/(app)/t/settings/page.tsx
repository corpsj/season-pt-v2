import { getMe } from "@/lib/data/groups/owner-ops";
import { SettingsClient } from "./ui";

export default async function SettingsPage() {
  const me = await getMe();
  return <SettingsClient me={me} />;
}
