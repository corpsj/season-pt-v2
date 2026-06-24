import { requireOwnerPage } from "@/lib/auth/guard";
import { getAllExercises } from "@/lib/data/groups/owner-ops";
import { ExercisesClient } from "./ui";

export default async function ExercisesPage() {
  await requireOwnerPage();
  const exercises = await getAllExercises();
  return <ExercisesClient exercises={exercises} />;
}
