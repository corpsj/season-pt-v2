import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMemberWorkoutRecords } from "@/lib/data/groups/member";
import { exerciseLine } from "@/lib/data/workout-format";

export default async function MemberRecordsPage() {
  const view = await getMemberWorkoutRecords();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">운동 기록</span>
        </div>

        {view.records.length === 0 ? (
          <EmptyState
            icon="document-text"
            title="아직 운동 기록이 없어요"
            desc="수업이 끝나면 선생님이 운동 기록을 남겨드려요."
          />
        ) : (
          view.records.map((r) => (
            <Card key={r.id} className="mb-3 p-[18px]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[14.5px] font-bold text-ink">{r.dateLabel}</span>
                <span className="text-[12px] font-medium text-muted">{r.timeLabel}</span>
              </div>
              {r.exercises.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {r.exercises.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{e.name}</span>
                      <span className="whitespace-nowrap text-[12.5px] font-medium text-muted">
                        {exerciseLine(e)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] font-medium text-muted">기록된 운동이 없어요</div>
              )}
              {r.comment ? (
                <div className="mt-3 rounded-[10px] bg-chip-soft px-3 py-2.5 text-[12.5px] font-medium leading-[1.55] text-muted2">
                  {r.comment}
                </div>
              ) : null}
            </Card>
          ))
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
