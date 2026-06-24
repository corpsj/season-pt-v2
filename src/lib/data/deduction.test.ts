// src/lib/data/deduction.test.ts
import { test, expect } from "bun:test";
import { shouldDeduct } from "./deduction";
import type { StudioSettings } from "@/lib/types";

const S: StudioSettings = {
  noshowDeducts: true, cancelCutoffHours: 0,
  notifExpiry: true, notifSession: true, notifPayment: true,
};

test("attend always deducts", () => {
  expect(shouldDeduct("attend", "2026-06-25T10:00:00Z", S)).toBe(true);
});
test("noshow respects noshowDeducts", () => {
  expect(shouldDeduct("noshow", "2026-06-25T10:00:00Z", { ...S, noshowDeducts: true })).toBe(true);
  expect(shouldDeduct("noshow", "2026-06-25T10:00:00Z", { ...S, noshowDeducts: false })).toBe(false);
});
test("cancel never deducts when cutoff is 0", () => {
  expect(shouldDeduct("cancel", "2026-06-25T10:00:00Z", { ...S, cancelCutoffHours: 0 })).toBe(false);
});
test("cancel deducts only inside the cutoff window", () => {
  const now = new Date("2026-06-25T00:00:00Z").getTime(); // session 10h away
  const session = "2026-06-25T10:00:00Z";
  expect(shouldDeduct("cancel", session, { ...S, cancelCutoffHours: 24 }, now)).toBe(true);  // 10 < 24
  expect(shouldDeduct("cancel", session, { ...S, cancelCutoffHours: 6 }, now)).toBe(false);  // 10 < 6 → false
});
