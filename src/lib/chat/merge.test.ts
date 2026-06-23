import { test, expect } from "bun:test";
import { isTempId, mergeMessages, latestCursor, TEMP_PREFIX } from "./merge";
import type { ChatMessageView } from "../types";

test("isTempId detects optimistic ids", () => {
  expect(isTempId(`${TEMP_PREFIX}3`)).toBe(true);
  expect(isTempId("real")).toBe(false);
});

test("mergeMessages skips messages already present by id", () => {
  const existing: ChatMessageView[] = [
    { id: "a", mine: false, text: "hi", createdAt: "2026-06-23T00:00:00Z" },
  ];
  const incoming: ChatMessageView[] = [
    { id: "a", mine: false, text: "hi", createdAt: "2026-06-23T00:00:00Z" },
    { id: "b", mine: false, text: "yo", createdAt: "2026-06-23T00:01:00Z" },
  ];
  expect(mergeMessages(existing, incoming).map((m) => m.id)).toEqual(["a", "b"]);
});

test("mergeMessages replaces an optimistic temp with the real row by text", () => {
  const existing: ChatMessageView[] = [
    { id: `${TEMP_PREFIX}0`, mine: true, text: "hello" },
  ];
  const incoming: ChatMessageView[] = [
    { id: "real1", mine: true, text: "hello", createdAt: "2026-06-23T00:02:00Z" },
  ];
  const merged = mergeMessages(existing, incoming);
  expect(merged).toHaveLength(1);
  expect(merged[0].id).toBe("real1");
  expect(merged[0].createdAt).toBe("2026-06-23T00:02:00Z");
});

test("mergeMessages appends genuinely new incoming messages", () => {
  const existing: ChatMessageView[] = [
    { id: "a", mine: true, text: "mine", createdAt: "2026-06-23T00:00:00Z" },
  ];
  const incoming: ChatMessageView[] = [
    { id: "b", mine: false, text: "theirs", createdAt: "2026-06-23T00:01:00Z" },
  ];
  expect(mergeMessages(existing, incoming).map((m) => m.id)).toEqual(["a", "b"]);
});

test("latestCursor returns the newest createdAt, ignoring temps", () => {
  const msgs: ChatMessageView[] = [
    { id: "a", mine: false, text: "x", createdAt: "2026-06-23T00:00:00Z" },
    { id: `${TEMP_PREFIX}0`, mine: true, text: "y" },
    { id: "b", mine: false, text: "z", createdAt: "2026-06-23T00:05:00Z" },
  ];
  expect(latestCursor(msgs, null)).toBe("2026-06-23T00:05:00Z");
});

test("latestCursor keeps fallback when no message has a timestamp", () => {
  const msgs: ChatMessageView[] = [{ id: `${TEMP_PREFIX}0`, mine: true, text: "y" }];
  expect(latestCursor(msgs, "2026-06-23T00:00:00Z")).toBe("2026-06-23T00:00:00Z");
});
