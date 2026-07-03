import { getMyMeals } from "@/lib/data/groups/meals";
import { MemberMealsClient } from "./ui";

export default async function MemberMealsPage(props: { searchParams: Promise<{ add?: string; date?: string }> }) {
  // ?add=1 — 캘린더의 "식단 기록하기"에서 진입하면 입력 폼을 바로 연다. ?date=YYYY-MM-DD면 날짜 프리필.
  const [{ add, date }, { meals, hasMore }] = await Promise.all([props.searchParams, getMyMeals()]);
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <MemberMealsClient initial={meals} initialHasMore={hasMore} initialOpen={add === "1"} initialDate={initialDate} />;
}
