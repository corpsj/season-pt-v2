import { getRecordTarget } from "@/lib/data/groups/scheduling";
import { getExercises } from "@/lib/data/groups/owner-ops";
import RecordClient from "./ui";

export default async function RecordPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [target, exercises] = await Promise.all([getRecordTarget(id), getExercises()]);
  return <RecordClient target={target} exerciseOptions={exercises.map((e) => e.name)} />;
}
