import { test, expect } from "bun:test";
import { teamMembersError, normalizeTeamSlots } from "./team-slots";

test("teamMembersError: needs exactly two distinct ids", () => {
  expect(teamMembersError(["a", "b"])).toBeNull();
  expect(teamMembersError(["a"])).not.toBeNull();
  expect(teamMembersError(["a", "a"])).not.toBeNull();
  expect(teamMembersError(["a", "b", "c"])).not.toBeNull();
  expect(teamMembersError(["a", ""])).not.toBeNull();
});

test("normalizeTeamSlots: dedups exact duplicates", () => {
  const r = normalizeTeamSlots([
    { weekday: 3, hour: 19, minute: 0 },
    { weekday: 3, hour: 19, minute: 0 },
    { weekday: 6, hour: 20, minute: 30 },
  ]);
  expect("slots" in r && r.slots).toEqual([
    { weekday: 3, hour: 19, minute: 0 },
    { weekday: 6, hour: 20, minute: 30 },
  ]);
});

test("normalizeTeamSlots: rejects out-of-range and bad minutes", () => {
  expect(normalizeTeamSlots([{ weekday: 7, hour: 19, minute: 0 }])).toHaveProperty("error");
  expect(normalizeTeamSlots([{ weekday: 3, hour: 5, minute: 0 }])).toHaveProperty("error");
  expect(normalizeTeamSlots([{ weekday: 3, hour: 23, minute: 0 }])).toHaveProperty("error");
  expect(normalizeTeamSlots([{ weekday: 3, hour: 19, minute: 15 }])).toHaveProperty("error");
});

test("normalizeTeamSlots: empty is an error", () => {
  expect(normalizeTeamSlots([])).toHaveProperty("error");
});
