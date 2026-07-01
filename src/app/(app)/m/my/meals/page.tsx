import { getMyMeals } from "@/lib/data/groups/meals";
import { MemberMealsClient } from "./ui";

export default async function MemberMealsPage() {
  const meals = await getMyMeals();
  return <MemberMealsClient initial={meals} />;
}
