import { expect, test } from "bun:test";
import {
  parseWorkoutExercises,
  validateWorkoutInput,
  copySet,
} from "./workout-sets";
import { exerciseLine } from "./workout-format";

test("legacy summaries remain summaries; malformed history is tolerated", () => {
  const [e] = parseWorkoutExercises([
    null,
    { name: "스쿼트", kg: 22.5, sets: 3, reps: 8 },
  ]);
  expect(e.setRows).toBeUndefined();
  expect(exerciseLine(e)).toBe("22.5kg · 8회 × 3세트");
});
test("targets and incomplete actual values do not become completed performance", () => {
  const [e] = parseWorkoutExercises([
    {
      name: "스쿼트",
      setRows: [
        { id: "a", target: { kg: 50, reps: 10 }, actual: {}, completed: false },
        {
          id: "b",
          target: { kg: 40, reps: 8 },
          actual: { kg: 42.5, reps: 7 },
          completed: true,
        },
        {
          id: "c",
          target: {},
          actual: { kg: 100, reps: 99 },
          completed: false,
        },
      ],
    },
  ]);
  expect(e.sets).toBe(1);
  expect(e.kg).toBe(42.5);
  expect(exerciseLine(e)).toBe("42.5kg · 7회");
  expect(e.setRows?.[0].actual).toEqual({});
});
test("copy uses completed actual as next target without inventing another completion", () => {
  const c = copySet(
    {
      id: "a",
      target: { kg: 20, reps: 10 },
      actual: { kg: 22.5, reps: 8 },
      completed: true,
    },
    "b",
  );
  expect(c.target).toEqual({ kg: 22.5, reps: 8 });
  expect(c.actual).toEqual({});
  expect(c.completed).toBe(false);
});
test("server input boundary rejects excessive, negative, fractional reps, missing actual reps", () => {
  const e = {
    name: "스쿼트",
    kg: 0,
    sets: 0,
    setRows: [
      { id: "a", target: { kg: 22.5 }, actual: { reps: 8 }, completed: true },
    ],
  };
  expect(validateWorkoutInput([e], "")).toBeNull();
  for (const row of [
    { target: { kg: -1 }, actual: {} },
    { target: {}, actual: { reps: 2.5 } },
    { target: {}, actual: {}, completed: true },
  ]) {
    expect(validateWorkoutInput([{ ...e, setRows: [row] }], "")).not.toBeNull();
  }
  expect(validateWorkoutInput(Array(31).fill(e), "")).not.toBeNull();
});
