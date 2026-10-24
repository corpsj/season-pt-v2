import { notFound } from "next/navigation";
import { getClassWorkspace } from "@/lib/data/groups/class-workflow";
import { getExercises } from "@/lib/data/groups/owner-ops";
import RecordClient from "./ui";

export default async function RecordPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const workspace = await getClassWorkspace(id);
  if (!workspace) notFound();
  const exercises = await getExercises();
  return (
    <RecordClient
      workspace={workspace}
      exerciseOptions={exercises.map(({ id, name }) => ({ id, name }))}
    />
  );
}
