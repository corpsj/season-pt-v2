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
  let changed = false;
  for (const msg of incoming) {
    if (knownIds.has(msg.id)) continue;
    if (msg.mine) {
      const tempIdx = result.findIndex(
        (m) => isTempId(m.id) && m.mine && m.text === msg.text
      );
      if (tempIdx !== -1) {
        result[tempIdx] = msg;
        knownIds.add(msg.id);
        changed = true;
        continue;
      }
    }
    result.push(msg);
    knownIds.add(msg.id);
    changed = true;
  }
  // 실제 변화가 없으면 원본 참조를 그대로 반환한다. 폴링 커서가 `>=`라 마지막 메시지가 매 폴마다
  // 다시 들어오는데, 새 배열을 반환하면 setState→재렌더→scrollToBottom이 3초마다 반복돼
  // 지난 메시지를 읽을 수 없었다(감사 H14). 동일 참조면 React가 재렌더를 건너뛴다.
  return changed ? result : existing;
}

/**
 * Newest server timestamp held, for use as the next poll cursor.
 * Optimistic (temp) messages have no `createdAt` and are ignored.
 * Assumes `createdAt` values are uniform UTC ISO strings (Supabase `timestamptz`,
 * `Z`-suffixed); lexicographic comparison would be unsafe for mixed offsets.
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
