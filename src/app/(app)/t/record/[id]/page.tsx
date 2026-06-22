import { getRecordTarget } from "@/lib/data/groups/scheduling";
import RecordClient from "./ui";

export default async function RecordPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const target = await getRecordTarget(id);
  return <RecordClient target={target} />;
}
