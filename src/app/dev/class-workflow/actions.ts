"use server";
import { fixtureState, resetFixture } from "./fixture-data";
import type { WorkoutDraft } from "@/lib/data/class-workflow-types";
export async function saveFixtureDraft(memberId: string, draft: WorkoutDraft) {
  if (process.env.NODE_ENV !== "development")
    return { ok: false, error: "Unavailable" };
  const m = fixtureState().members.find((m) => m.memberId === memberId);
  if (!m) return { ok: false };
  if (m.version !== draft.version)
    return { ok: false, conflict: true, error: "합성 버전 충돌" };
  Object.assign(m, draft, { version: draft.version + 1 });
  return { ok: true, version: m.version };
}
export async function completeFixture() {
  if (process.env.NODE_ENV !== "development") return { ok: false };
  const w = fixtureState();
  w.status = "attended";
  w.attendanceVersion++;
  return { ok: true, version: w.attendanceVersion };
}
export async function resetFixtureState() {
  if (process.env.NODE_ENV === "development") resetFixture();
}
export async function correctFixture() {
  if (process.env.NODE_ENV !== "development") return { ok: false };
  const w = fixtureState();
  w.status = "scheduled";
  w.attendanceVersion++;
  return { ok: true, version: w.attendanceVersion };
}
