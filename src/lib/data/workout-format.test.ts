import { test, expect } from "bun:test";
import { exerciseLine } from "./workout-format";

test("exerciseLine — reps 유무·kg 0 하위호환", () => {
  expect(exerciseLine({ kg: 60, sets: 3, reps: 10 })).toBe("60kg · 10회 × 3세트");
  expect(exerciseLine({ kg: 60, sets: 3 })).toBe("60kg · 3세트");
  expect(exerciseLine({ kg: 0, sets: 3, reps: 12 })).toBe("12회 × 3세트");
  expect(exerciseLine({ kg: 0, sets: 3 })).toBe("3세트");
});
