import type { WorkoutExercise } from "@/lib/types";

export type SetValues = { kg?: number; reps?: number };
export type WorkoutSet = {
  id: string;
  target: SetValues;
  actual: SetValues;
  completed: boolean;
};

const value = (
  v: unknown,
  max: number,
  integer = false,
): number | undefined => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    return undefined;
  return Math.round(n * 100) / 100;
};
function values(raw: unknown): SetValues {
  const r = raw && typeof raw === "object" ? (raw as SetValues) : {};
  const kg = value(r.kg, 9999);
  const reps = value(r.reps, 999, true);
  return { ...(kg != null ? { kg } : {}), ...(reps != null ? { reps } : {}) };
}

/** Tolerant read adapter: old summaries stay summaries; no invented historical sets. */
export function parseWorkoutExercises(raw: unknown): WorkoutExercise[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap((item) => {
    if (!item || typeof item.name !== "string") return [];
    const e: WorkoutExercise = {
      name: item.name.slice(0, 80),
      kg: value(item.kg, 9999) ?? 0,
      sets: value(item.sets, 100, true) ?? 0,
      ...(value(item.reps, 999, true) != null
        ? { reps: value(item.reps, 999, true) }
        : {}),
      ...(typeof item.exerciseId === "string"
        ? { exerciseId: item.exerciseId.slice(0, 80) }
        : {}),
    };
    if (Array.isArray(item.setRows)) {
      e.setRows = item.setRows
        .slice(0, 40)
        .map((row: Partial<WorkoutSet>, i: number) => ({
          id: typeof row?.id === "string" ? row.id.slice(0, 80) : `set-${i}`,
          target: values(row?.target),
          actual: values(row?.actual),
          completed:
            row?.completed === true &&
            value(row?.actual?.reps, 999, true) != null,
        }));
      const done = e.setRows!.filter((s) => s.completed);
      e.kg = done[0]?.actual.kg ?? 0;
      e.reps = done[0]?.actual.reps;
      e.sets = done.length;
    }
    return [e];
  });
}

export function validateWorkoutInput(
  raw: unknown,
  comment: unknown,
): string | null {
  if (!Array.isArray(raw) || raw.length > 30)
    return "운동은 최대 30개까지 기록할 수 있어요.";
  if (typeof comment !== "string" || comment.length > 2000)
    return "코멘트는 2,000자 이내로 입력해주세요.";
  for (const e of raw) {
    if (
      !e ||
      typeof e.name !== "string" ||
      !e.name.trim() ||
      e.name.length > 80
    )
      return "운동 이름을 입력해주세요.";
    if (e.setRows !== undefined) {
      if (!Array.isArray(e.setRows) || e.setRows.length > 40)
        return "종목당 최대 40세트까지 기록할 수 있어요.";
      for (const row of e.setRows) {
        for (const field of [row?.target, row?.actual]) {
          if (!field || typeof field !== "object")
            return "세트 값이 올바르지 않아요.";
          if (field.kg != null && value(field.kg, 9999) == null)
            return "중량은 0~9,999kg로 입력해주세요.";
          if (field.reps != null && value(field.reps, 999, true) == null)
            return "횟수는 0~999 정수로 입력해주세요.";
        }
        if (row.completed && row.actual?.reps == null)
          return "완료한 세트의 실제 횟수를 입력해주세요.";
      }
    } else if (value(e.kg, 9999) == null || value(e.sets, 100, true) == null)
      return "기존 기록 값이 올바르지 않아요.";
  }
  return null;
}

export function previousExercise(
  exercises: WorkoutExercise[],
  current: WorkoutExercise,
) {
  return exercises.find((e) =>
    current.exerciseId && e.exerciseId
      ? e.exerciseId === current.exerciseId
      : e.name === current.name,
  );
}

/** Copy the prescription, never mark the new set performed. */
export function copySet(row: WorkoutSet, id: string): WorkoutSet {
  return {
    id,
    target: { ...(row.completed ? row.actual : row.target) },
    actual: {},
    completed: false,
  };
}
