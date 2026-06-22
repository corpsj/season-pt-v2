import { getAttendTarget } from "@/lib/data/groups/scheduling";
import AttendClient from "./ui";

export default async function AttendPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const target = await getAttendTarget(id);
  return <AttendClient target={target} />;
}
