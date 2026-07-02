import { getMyMeals } from "@/lib/data/groups/meals";
import { MemberMealsClient } from "./ui";

export default async function MemberMealsPage(props: { searchParams: Promise<{ add?: string }> }) {
  // ?add=1 — 캘린더의 "식단 기록하기"에서 진입하면 입력 폼을 바로 연다.
  const [{ add }, { meals, hasMore }] = await Promise.all([props.searchParams, getMyMeals()]);
  return <MemberMealsClient initial={meals} initialHasMore={hasMore} initialOpen={add === "1"} />;
}
