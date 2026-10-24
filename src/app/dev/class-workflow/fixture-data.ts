import "server-only";
import type { ClassWorkspace } from "@/lib/data/class-workflow-types";
const base: ClassWorkspace = {
  editorId: "fixture-trainer",
  sessionId: "fixture-session",
  attendanceVersion: 0,
  status: "scheduled",
  scheduledAt: "2026-10-23T10:00:00Z",
  dateLabel: "10/23 금 · 오후 7:00",
  members: [
    {
      memberId: "fixture-a",
      name: "합성 회원 A",
      initial: "합",
      avatarTone: "sage",
      remaining: 3,
      exercises: [],
      comment: "",
      version: 0,
      previous: [{ name: "스쿼트", kg: 22.5, reps: 10, sets: 3 }],
      previousDate: "2026-10-20",
    },
    {
      memberId: "fixture-b",
      name: "합성 회원 B",
      initial: "합",
      avatarTone: "sage",
      remaining: 2,
      exercises: [{ name: "플랭크 기존 요약", kg: 0, sets: 2, reps: 10 }],
      comment: "",
      version: 0,
      previous: [],
      previousDate: null,
    },
  ],
};
const state = globalThis as typeof globalThis & {
  classWorkflowFixture?: ClassWorkspace;
};
export function fixtureState() {
  return (state.classWorkflowFixture ??= structuredClone(base));
}
export function resetFixture() {
  state.classWorkflowFixture = structuredClone(base);
}
