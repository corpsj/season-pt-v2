"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { Stepper } from "@/components/ui/Stepper";
import { Combobox } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { exerciseLine } from "@/lib/data/workout-format";
import { logMyWorkout, deleteMyWorkout } from "@/lib/data/groups/workout-actions";
import type { MemberWorkoutRecord, WorkoutExercise } from "@/lib/types";

const todayKstDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
const blankEx = (): WorkoutExercise => ({ name: "", kg: 0, sets: 0, reps: 10 });

export function MemberRecordsClient({
  initial,
  exerciseOptions,
  initialOpen = false,
}: {
  initial: MemberWorkoutRecord[];
  exerciseOptions: string[];
  initialOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [, refresh] = useTransition();
  const [open, setOpen] = useState(initialOpen);
  const [busy, setBusy] = useState(false);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([blankEx()]);
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(todayKstDate());

  const update = (i: number, patch: Partial<WorkoutExercise>) =>
    setExercises((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  function reset() {
    setOpen(false);
    setExercises([blankEx()]);
    setComment("");
    setDate(todayKstDate());
  }

  async function submit() {
    if (busy) return;
    const named = exercises.filter((e) => e.name.trim());
    if (named.length === 0 && !comment.trim()) return toast("운동 종목이나 메모를 입력해주세요", "error");
    setBusy(true);
    try {
      // 오늘이면 서버가 now()로 기록(실제 시각 보존), 지난 날짜만 date 전달.
      const r = await logMyWorkout(named, comment, date !== todayKstDate() ? date : null);
      if (!r.ok) return toast(r.error ?? "기록에 실패했어요", "error");
      toast("운동을 기록했어요");
      reset();
      refresh(() => router.refresh());
    } catch {
      toast("기록에 실패했어요", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "이 운동 기록을 삭제할까요?", description: "되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    if (busy) return;
    setBusy(true);
    try {
      const r = await deleteMyWorkout(id);
      if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
      refresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">운동 기록</span>
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="ml-auto inline-flex items-center gap-1 rounded-[12px] bg-sage px-3 py-2 text-[13px] font-semibold text-surface active:scale-[.97]"
            >
              <Icon name="plus-bold" size={14} />기록
            </button>
          ) : null}
        </div>

        {open ? (
          <Card className="mb-4 p-[18px]">
            <div className="mb-1 text-[12px] font-medium leading-relaxed text-muted">
              수업이 없는 날 직접 운동한 기록을 남길 수 있어요.
            </div>
            <div className="mb-2.5 mt-2 text-[12.5px] font-semibold text-muted5">운동 종목</div>
            <div className="flex flex-col gap-2.5">
              {exercises.map((ex, i) => (
                <div key={i} className="rounded-[14px] border border-ink/[0.08] bg-[#FBF9F5] p-3.5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <div className="flex-1">
                      <Combobox value={ex.name} options={exerciseOptions} onChange={(v) => update(i, { name: v })} placeholder="종목 이름" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setExercises((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted4 hover:bg-ink/[0.06]"
                      aria-label="종목 삭제"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Stepper value={ex.kg} unit="kg" onDec={() => update(i, { kg: Math.max(0, ex.kg - 5) })} onInc={() => update(i, { kg: ex.kg + 5 })} />
                    <Stepper value={ex.reps ?? 10} unit="회" onDec={() => update(i, { reps: Math.max(0, (ex.reps ?? 10) - 1) })} onInc={() => update(i, { reps: (ex.reps ?? 10) + 1 })} />
                    <Stepper value={ex.sets} unit="세트" onDec={() => update(i, { sets: Math.max(0, ex.sets - 1) })} onInc={() => update(i, { sets: ex.sets + 1 })} />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setExercises((prev) => [...prev, blankEx()])}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed border-sage-deep/40 py-3 text-[13.5px] font-bold text-sage-deep"
            >
              <Icon name="plus-bold" size={16} />종목 추가
            </button>

            <PlainTextInput
              multiline
              value={comment}
              onChange={setComment}
              placeholder="메모 (예: 오늘 컨디션·느낌)"
              className="mt-3 min-h-[44px] w-full resize-none rounded-[13px] border border-ink/[0.12] bg-[#FBF9F5] px-3.5 py-3 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
            />

            <div className="mt-3 flex items-center gap-2">
              <Icon name="calendar" size={16} className="flex-none text-muted" />
              <span className="text-[13px] font-semibold text-muted">날짜</span>
              <input
                type="date"
                value={date}
                max={todayKstDate()}
                onChange={(e) => setDate(e.target.value)}
                className="ml-auto rounded-[11px] border border-ink/[0.12] bg-[#FBF9F5] px-3 py-2 text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              />
            </div>

            <div className="mt-3.5 flex gap-2">
              <button onClick={reset} disabled={busy} className="flex-1 rounded-[13px] border border-ink/[0.12] bg-white py-3 text-[14px] font-semibold text-muted disabled:opacity-50">취소</button>
              <button onClick={submit} disabled={busy} className="flex-[1.6] rounded-[13px] bg-sage py-3 text-[14px] font-semibold text-surface disabled:opacity-50">{busy ? "기록 중…" : "기록하기"}</button>
            </div>
          </Card>
        ) : null}

        {initial.length === 0 && !open ? (
          <EmptyState
            icon="document-text"
            title="아직 운동 기록이 없어요"
            desc="수업이 끝나면 선생님이 기록을 남겨드려요. 직접 운동한 날은 위 [기록]으로 남길 수 있어요."
          />
        ) : (
          initial.map((r) => (
            <Card key={r.id} className="mb-3 p-[18px]">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[14.5px] font-bold text-ink">{r.dateLabel}</span>
                {r.editable ? (
                  <span className="rounded-md bg-[#EDF4E3] px-1.5 py-0.5 text-[10.5px] font-bold text-sage-deep">직접 기록</span>
                ) : null}
                <span className="ml-auto text-[12px] font-medium text-muted">{r.timeLabel}</span>
                {r.editable ? (
                  <button onClick={() => remove(r.id)} disabled={busy} className="text-[#C2BAAD] disabled:opacity-50" aria-label="삭제">
                    <Icon name="close" size={16} />
                  </button>
                ) : null}
              </div>
              {r.exercises.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {r.exercises.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{e.name}</span>
                      <span className="whitespace-nowrap text-[12.5px] font-medium text-muted">{exerciseLine(e)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] font-medium text-muted">기록된 운동이 없어요</div>
              )}
              {r.comment ? (
                <div className="mt-3 rounded-[10px] bg-chip-soft px-3 py-2.5 text-[12.5px] font-medium leading-[1.55] text-muted2">{r.comment}</div>
              ) : null}
            </Card>
          ))
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
