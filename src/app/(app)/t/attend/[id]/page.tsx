import { getAttendTarget } from "@/lib/data/groups/scheduling";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import AttendClient from "./ui";

export default async function AttendPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [target, settings] = await Promise.all([getAttendTarget(id), getStudioSettings()]);
  return <AttendClient target={target} settings={settings} />;
}
