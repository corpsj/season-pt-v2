import { getClassDetail } from "@/lib/data/groups/scheduling";
import ClassDetailClient from "./ui";

export default async function ClassDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const view = await getClassDetail(id);
  return <ClassDetailClient id={id} view={view} />;
}
