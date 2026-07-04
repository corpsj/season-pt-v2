import { getMemberWorkoutRecords } from "@/lib/data/groups/member";
import { getExercises } from "@/lib/data/groups/owner-ops";
import { MemberRecordsClient } from "./ui";

export default async function MemberRecordsPage(props: { searchParams: Promise<{ add?: string }> }) {
  // ?add=1 — 캘린더의 "오늘 운동 기록하기"에서 진입하면 입력 폼을 바로 연다.
  const [{ add }, view, exercises] = await Promise.all([
    props.searchParams,
    getMemberWorkoutRecords(),
    getExercises(),
  ]);
  return (
    <MemberRecordsClient
      initial={view.records}
      exerciseOptions={exercises.map((e) => e.name)}
      initialOpen={add === "1"}
    />
  );
}
