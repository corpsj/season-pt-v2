/** 운동 한 줄 표시. reps 있으면 "{kg}kg · {reps}회 × {sets}세트", 없으면 "{kg}kg · {sets}세트". kg 0이면 kg 생략. */
export function exerciseLine(e: { kg: number; sets: number; reps?: number; setRows?: import("./workout-sets").WorkoutSet[] }): string {
  if (e.setRows) {
    const done = e.setRows.filter((s) => s.completed);
    return done.length ? done.map((s) => `${s.actual.kg != null ? `${s.actual.kg}kg · ` : ""}${s.actual.reps ?? 0}회`).join(" / ") : "완료한 세트 없음";
  }
  const kg = e.kg > 0 ? `${e.kg}kg · ` : "";
  const rep = e.reps ? `${e.reps}회 × ` : "";
  return `${kg}${rep}${e.sets}세트`;
}
