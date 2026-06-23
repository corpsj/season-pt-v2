import type { ChatMessageView } from "@/lib/types";

/** Prefix for optimistic (not-yet-confirmed) message ids. */
export const TEMP_PREFIX = "tmp_";

/** True for an optimistic message id created locally before the server confirms. */
export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

/**
 * Merge server messages into the current list:
 * - skip any message whose id we already hold (dedupe across the `>=` cursor boundary),
 * - reconcile an optimistic temp (mine + same text) by replacing it with the real row,
 * - otherwise append.
 */
export function mergeMessages(
  existing: ChatMessageView[],
  incoming: ChatMessageView[]
): ChatMessageView[] {
  const knownIds = new Set(existing.filter((m) => !isTempId(m.id)).map((m) => m.id));
  const result = [...existing];
  for (const msg of incoming) {
    if (knownIds.has(msg.id)) continue;
    if (msg.mine) {
      const tempIdx = result.findIndex(
        (m) => isTempId(m.id) && m.mine && m.text === msg.text
      );
      if (tempIdx !== -1) {
        result[tempIdx] = msg;
        knownIds.add(msg.id);
        continue;
      }
    }
    result.push(msg);
    knownIds.add(msg.id);
  }
  return result;
}

/**
 * Newest server timestamp held, for use as the next poll cursor.
 * Optimistic (temp) messages have no `createdAt` and are ignored.
 */
export function latestCursor(
  messages: ChatMessageView[],
  fallback: string | null
): string | null {
  let max = fallback;
  for (const m of messages) {
    if (m.createdAt && (!max || m.createdAt > max)) max = m.createdAt;
  }
  return max;
}
