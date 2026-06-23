# Chat Near-Real-Time (Polling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat messages from the other party appear automatically (open room + thread list + tab unread badge) without a manual refresh, via polling.

**Architecture:** No Supabase Realtime. A single polling mechanism (room 3s, list/badge 5s, paused when the tab is hidden) calls read-only server actions that reuse the existing service-role + code-scoping data layer. Clients hold a `created_at` cursor and dedupe incoming messages by id; sends are optimistic and reconciled with the server-returned row. No DB schema, RLS, publication, or auth changes.

**Tech Stack:** Next.js (custom build) App Router, React client components, Supabase JS (service-role, server-only), Bun (`bun test`), TypeScript.

## Global Constraints

- Runtime/tooling is **Bun**: use `bun test`, `bunx tsc`, `bun run build` (never npm/node/jest).
- Data access stays **server-only via service-role** (`sb = createSupabaseAdmin()`); scoping is enforced in code through `getTrainerContext()` / `getMemberContext()`. Do NOT add RLS policies, publications, or client-side DB reads.
- Trainers authenticate via Supabase Auth; **members via a custom signed cookie (not Supabase Auth)** — never assume a member browser has a Supabase session.
- All user-facing copy is **Korean**, matching existing tone (e.g. "전송에 실패했어요.").
- Server action files start with `"use server"` and may export **only async functions**. Server-only data modules start with `import "server-only"`.
- KST time labels use the existing helpers (`kstClock` in chat.ts, `clockLabel` in member.ts) — do not reinvent formatting.
- Cursor comparisons assume Supabase returns consistent ISO `timestamptz` strings; compare with `>=` in SQL and lexicographic `>` in JS.

---

### Task 1: Pure merge/cursor module + `createdAt` on the view type

**Files:**
- Modify: `src/lib/types.ts` (add `createdAt?` to `ChatMessageView`)
- Create: `src/lib/chat/merge.ts`
- Test: `src/lib/chat/merge.test.ts`
- Modify: `tsconfig.json` (exclude test files from the Next typecheck)

**Interfaces:**
- Consumes: `ChatMessageView` from `@/lib/types`.
- Produces:
  - `TEMP_PREFIX: string`
  - `isTempId(id: string): boolean`
  - `mergeMessages(existing: ChatMessageView[], incoming: ChatMessageView[]): ChatMessageView[]`
  - `latestCursor(messages: ChatMessageView[], fallback: string | null): string | null`

- [ ] **Step 1: Add `createdAt` to `ChatMessageView`**

In `src/lib/types.ts`, change the interface (currently lines ~319-325):

```ts
export interface ChatMessageView {
  id: string;
  mine: boolean;
  sender?: string; // for 2:1 rooms
  text: string;
  time?: string;
  createdAt?: string; // raw ISO timestamp; absent on optimistic (temp) messages
}
```

- [ ] **Step 2: Exclude test files from the Next typecheck**

In `tsconfig.json`, change the `exclude` array (line 33) to:

```json
  "exclude": ["node_modules", "scripts", "docs", "**/*.test.ts", "**/*.test.tsx"]
```

(`bun:test` types are not available to Next's `tsc`; tests are run by `bun test` directly. This mirrors the existing pattern of keeping Bun-only files out of the Vercel typecheck.)

- [ ] **Step 3: Write the failing tests**

Create `src/lib/chat/merge.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun test src/lib/chat/merge.test.ts`
Expected: FAIL — module `./merge` not found / exports undefined.

- [ ] **Step 5: Implement the module**

Create `src/lib/chat/merge.ts`:

```ts
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/lib/chat/merge.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/chat/merge.ts src/lib/chat/merge.test.ts tsconfig.json
git commit -m "feat(chat): pure message merge/cursor module + createdAt view field"
```

---

### Task 2: `usePolling` hook

**Files:**
- Create: `src/lib/hooks/usePolling.ts`

**Interfaces:**
- Produces: `usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled?: boolean): void`
- Behavior contract (verified by downstream tasks + build, not unit-tested — no React test harness exists): runs `fn` once immediately on mount, then every `intervalMs`; stops while `document.visibilityState === "hidden"` and runs once + resumes on becoming visible; tears down on unmount; reads `fn` from a ref so the interval is not recreated each render; does nothing when `enabled` is false.

- [ ] **Step 1: Implement the hook**

Create `src/lib/hooks/usePolling.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";

/**
 * Run `fn` immediately, then every `intervalMs` while the tab is visible.
 * Pauses when the tab is hidden and runs once + resumes when it returns.
 * `fn` is read from a ref so the interval always calls the latest closure
 * without being recreated on every render. No-op when `enabled` is false.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      void fnRef.current();
    };
    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors. (If Next route-type generation produces unrelated noise, run `bun run build` instead and confirm it compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/usePolling.ts
git commit -m "feat(chat): add usePolling hook (visibility-aware interval)"
```

---

### Task 3: Trainer server layer — poll actions, send-returns-row, room cursor

**Files:**
- Modify: `src/lib/types.ts` (add `cursor?` to `ChatRoomView`)
- Modify: `src/lib/data/groups/chat.ts` (export `kstClock`; add `loadNewTrainerMessages`; add `createdAt` + `cursor` to `getChatRoom`)
- Modify: `src/lib/data/groups/chat-actions.ts` (`pollTrainerMessages`, `pollChatThreads`, `pollChatUnread`; `sendChat` returns the created message)

**Interfaces:**
- Consumes: `ChatMessageView` (with `createdAt`, Task 1); existing `loadThreadParticipants`, `getTrainerContext`, `sb`, `getChatThreads`, `getChatUnread`; `getMemberChatUnread` from member.ts.
- Produces:
  - `kstClock(iso: string | Date): string` (now exported)
  - `loadNewTrainerMessages(threadId: string, sinceISO: string | null): Promise<ChatMessageView[]>` (server-only)
  - `pollTrainerMessages(threadId: string, sinceISO: string | null): Promise<ChatMessageView[]>` (action)
  - `pollChatThreads(): Promise<ChatThreadView[]>` (action)
  - `pollChatUnread(): Promise<number>` (action)
  - `sendChat(threadId, text): Promise<{ ok: boolean; error?: string; message?: ChatMessageView }>`
  - `ChatRoomView.cursor?: string | null`

- [ ] **Step 1: Add `cursor` to `ChatRoomView`**

In `src/lib/types.ts`, in `ChatRoomView` (currently lines ~326-335), add the field:

```ts
export interface ChatRoomView {
  threadId: string;
  name: string;
  isTeam: boolean;
  team?: TeamAvatar;
  initial: string;
  avatarTone: AvatarTone;
  sub: string;
  messages: ChatMessageView[];
  cursor?: string | null; // newest message's created_at; initial poll cursor
}
```

- [ ] **Step 2: Export `kstClock` in chat.ts**

In `src/lib/data/groups/chat.ts`, change the helper declaration (line 15) from `function kstClock(` to:

```ts
export function kstClock(iso: string | Date): string {
```

- [ ] **Step 3: Populate `createdAt` + `cursor` in `getChatRoom`**

In `src/lib/data/groups/chat.ts`, inside `getChatRoom`, update the message mapping (currently lines ~230-240) to include `createdAt`:

```ts
  const messages: ChatMessageView[] = (msgRows ?? []).map((row) => {
    const mine = row.sender_type === "trainer";
    return {
      id: row.id as string,
      mine,
      sender:
        isTeam && !mine ? senderName.get(row.sender_id as string) : undefined,
      text: row.text as string,
      time: kstClock(row.created_at as string),
      createdAt: row.created_at as string,
    };
  });

  const cursor =
    msgRows && msgRows.length
      ? (msgRows[msgRows.length - 1].created_at as string)
      : null;
```

Then add `cursor` to **both** returned objects (the `isTeam` branch ~lines 242-254 and the 1:1 branch ~lines 255-264). Example for the 1:1 branch:

```ts
  const m = participants[0];
  return {
    threadId,
    name: m?.name ?? "",
    isTeam: false,
    initial: m ? initialOf(m.name) : "",
    avatarTone: m?.avatar_tone ?? "sage",
    sub,
    messages,
    cursor,
  };
```

And the team branch likewise gains `cursor,` before its closing brace.

- [ ] **Step 4: Add `loadNewTrainerMessages` in chat.ts**

In `src/lib/data/groups/chat.ts`, add after `getChatRoom` (before `scheduleSub`):

```ts
/** New messages in a thread at/after `sinceISO` (or all if null), marking incoming as read. */
export async function loadNewTrainerMessages(
  threadId: string,
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  const t = await getTrainerContext();
  if (!t) return [];

  const { data: thread } = await sb
    .from("chat_threads")
    .select("id, type")
    .eq("id", threadId)
    .eq("trainer_id", t.id)
    .maybeSingle();
  if (!thread) return [];

  const isTeam = thread.type === "2on1";
  const participants = (await loadThreadParticipants([threadId])).get(threadId) ?? [];
  const senderName = new Map<string, string>();
  for (const m of participants) senderName.set(m.id, m.name);

  let q = sb
    .from("chat_messages")
    .select("id, sender_type, sender_id, text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { data: msgRows } = await q;

  // Mark incoming (member) messages as read now that they're delivered.
  await sb
    .from("chat_messages")
    .update({ read_by_trainer: true })
    .eq("thread_id", threadId)
    .eq("read_by_trainer", false)
    .eq("sender_type", "member");

  return (msgRows ?? []).map((row) => {
    const mine = row.sender_type === "trainer";
    return {
      id: row.id as string,
      mine,
      sender:
        isTeam && !mine ? senderName.get(row.sender_id as string) : undefined,
      text: row.text as string,
      time: kstClock(row.created_at as string),
      createdAt: row.created_at as string,
    } satisfies ChatMessageView;
  });
}
```

- [ ] **Step 5: Add poll actions + return row from `sendChat` in chat-actions.ts**

In `src/lib/data/groups/chat-actions.ts`, replace the imports (lines 1-3) with:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, getMemberContext } from "@/lib/data/db";
import {
  kstClock,
  loadNewTrainerMessages,
  getChatThreads,
  getChatUnread,
} from "@/lib/data/groups/chat";
import { getMemberChatUnread } from "@/lib/data/groups/member";
import type { ChatMessageView, ChatThreadView } from "@/lib/types";
```

Change the `sendChat` signature and its success path. Replace the signature line and the final insert/return region:

```ts
export async function sendChat(
  threadId: string,
  text: string
): Promise<{ ok: boolean; error?: string; message?: ChatMessageView }> {
```

Replace the insert + final return (currently lines ~24-42) with:

```ts
  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await sb
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender_type: "trainer",
      sender_id: t.id,
      text: body,
      read_by_trainer: true,
      read_by_member: false,
    })
    .select("id, created_at")
    .single();
  if (insErr || !inserted) return { ok: false, error: "전송에 실패했어요." };

  await sb
    .from("chat_threads")
    .update({ last_message: `나: ${body}`, last_at: now, updated_at: now })
    .eq("id", threadId);

  revalidatePath("/t/chat");
  revalidatePath(`/t/chat/${threadId}`);
  return {
    ok: true,
    message: {
      id: inserted.id as string,
      mine: true,
      text: body,
      time: kstClock(inserted.created_at as string),
      createdAt: inserted.created_at as string,
    },
  };
```

Then append the three poll actions at the end of the file:

```ts
/** Client-callable poll for new messages in a trainer thread. */
export async function pollTrainerMessages(
  threadId: string,
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  return loadNewTrainerMessages(threadId, sinceISO);
}

/** Client-callable refresh of the trainer's thread list. */
export async function pollChatThreads(): Promise<ChatThreadView[]> {
  return getChatThreads();
}

/** Client-callable unread count; detects trainer vs member from the session. */
export async function pollChatUnread(): Promise<number> {
  const t = await getTrainerContext();
  if (t) return getChatUnread();
  const m = await getMemberContext();
  if (m) return getMemberChatUnread();
  return 0;
}
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Fallback: `bun run build`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/data/groups/chat.ts src/lib/data/groups/chat-actions.ts
git commit -m "feat(chat): trainer poll actions, send returns row, room cursor"
```

---

### Task 4: Member server layer — poll action, send-returns-row, room cursor

**Files:**
- Modify: `src/lib/data/groups/member.ts` (export `clockLabel`; add `loadNewMemberMessages`; add `createdAt` + `cursor` to `getMemberChatRoom`)
- Modify: `src/lib/data/groups/member-actions.ts` (`pollMemberMessages`; `sendMemberChat` returns the created message)

**Interfaces:**
- Consumes: `ChatMessageView` (Task 1); existing `getMemberContext`, `sb`, `requireMember`, `primaryTrainer`, `clockLabel`.
- Produces:
  - `clockLabel(iso: string): string` (now exported)
  - `loadNewMemberMessages(sinceISO: string | null): Promise<ChatMessageView[]>` (server-only)
  - `getMemberChatRoom()` return gains `messages: ChatMessageView[]` (with `createdAt`) and `cursor: string | null`
  - `pollMemberMessages(sinceISO: string | null): Promise<ChatMessageView[]>` (action)
  - `sendMemberChat(text): Promise<{ ok: boolean; error?: string; message?: ChatMessageView }>`

- [ ] **Step 1: Export `clockLabel` and import the view type in member.ts**

In `src/lib/data/groups/member.ts`, change the declaration at line 60 from `function clockLabel(` to:

```ts
export function clockLabel(iso: string): string {
```

In the existing `import type { ... }` block near the top, add `ChatMessageView` to the imported types (it pulls from `@/lib/types`).

- [ ] **Step 2: Populate `createdAt` + `cursor` in `getMemberChatRoom`**

In `src/lib/data/groups/member.ts`, update `getMemberChatRoom`. For the empty-thread early return (currently ~lines 447-454), add `cursor`:

```ts
  if (!thread) {
    return {
      trainerName,
      initial,
      sub,
      messages: [] as ChatMessageView[],
      cursor: null as string | null,
    };
  }
```

For the populated return (currently ~lines 470-480), add `createdAt` and `cursor`:

```ts
  const messages: ChatMessageView[] = (msgs ?? []).map((m) => ({
    id: m.id as string,
    mine: m.sender_type === "member",
    text: m.text as string,
    time: clockLabel(m.created_at as string),
    createdAt: m.created_at as string,
  }));

  const cursor =
    msgs && msgs.length ? (msgs[msgs.length - 1].created_at as string) : null;

  return { trainerName, initial, sub, messages, cursor };
```

- [ ] **Step 3: Add `loadNewMemberMessages` in member.ts**

In `src/lib/data/groups/member.ts`, add right after `getMemberChatRoom`:

```ts
/** New messages in the member's thread at/after `sinceISO` (or all if null), marking incoming as read. */
export async function loadNewMemberMessages(
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  const me = await getMemberContext();
  if (!me) return [];

  const { data: cp } = await sb
    .from("chat_participants")
    .select("thread_id, chat_threads(id, updated_at)")
    .eq("member_id", me.memberId);
  const threads = (cp ?? [])
    .map(
      (r) =>
        (r as unknown as { chat_threads?: { id: string; updated_at: string } })
          .chat_threads
    )
    .filter((t): t is { id: string; updated_at: string } => !!t)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  const thread = threads[0];
  if (!thread) return [];

  let q = sb
    .from("chat_messages")
    .select("id, sender_type, text, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { data: msgs } = await q;

  await sb
    .from("chat_messages")
    .update({ read_by_member: true })
    .eq("thread_id", thread.id)
    .eq("sender_type", "trainer")
    .eq("read_by_member", false);

  return (msgs ?? []).map((m) => ({
    id: m.id as string,
    mine: m.sender_type === "member",
    text: m.text as string,
    time: clockLabel(m.created_at as string),
    createdAt: m.created_at as string,
  } satisfies ChatMessageView));
}
```

- [ ] **Step 4: Add `pollMemberMessages` + return row from `sendMemberChat`**

In `src/lib/data/groups/member-actions.ts`, update imports. Change line 4 region to add the helpers and type:

```ts
import { sb, getMemberContext } from "@/lib/data/db";
import {
  NOTICE_READ_COOKIE,
  NOTICE_UNREAD_IDS,
  NOTIF_COOKIE,
  NOTIF_KEYS,
  clockLabel,
  loadNewMemberMessages,
} from "./member";
import type { ChatMessageView } from "@/lib/types";
```

Change `sendMemberChat` to return the inserted row. Replace its signature and insert/return region (currently lines ~132-165):

```ts
export async function sendMemberChat(
  text: string
): Promise<{ ok: boolean; error?: string; message?: ChatMessageView }> {
```

and the insert/return:

```ts
  const now = new Date().toISOString();
  const { data: inserted, error } = await sb
    .from("chat_messages")
    .insert({
      thread_id: thread.id,
      sender_type: "member",
      sender_id: me.memberId,
      text: body,
      read_by_member: true,
      read_by_trainer: false,
    })
    .select("id, created_at")
    .single();
  if (error || !inserted) return { ok: false, error: "메시지를 보내지 못했어요" };

  await sb
    .from("chat_threads")
    .update({ last_message: body, last_at: now, updated_at: now })
    .eq("id", thread.id);

  revalidatePath("/m/chat");
  return {
    ok: true,
    message: {
      id: inserted.id as string,
      mine: true,
      text: body,
      time: clockLabel(inserted.created_at as string),
      createdAt: inserted.created_at as string,
    },
  };
```

Add the poll action (place it just after `sendMemberChat`):

```ts
/** Client-callable poll for new messages in the member's thread. */
export async function pollMemberMessages(
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  return loadNewMemberMessages(sinceISO);
}
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Fallback: `bun run build`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/groups/member.ts src/lib/data/groups/member-actions.ts
git commit -m "feat(chat): member poll action, send returns row, room cursor"
```

---

### Task 5: Trainer chat room — polling + optimistic reconcile

**Files:**
- Modify: `src/app/(app)/t/chat/[id]/ui.tsx`

**Interfaces:**
- Consumes: `pollTrainerMessages`, `sendChat` (Task 3); `mergeMessages`, `latestCursor`, `TEMP_PREFIX` (Task 1); `usePolling` (Task 2); `useToast`; `ChatRoomView.cursor` (Task 3).

- [ ] **Step 1: Rewrite the client component**

Replace the entire contents of `src/app/(app)/t/chat/[id]/ui.tsx` with:

```tsx
"use client";
import { useRef, useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { ChatInput } from "@/components/ui/ChatInput";
import { useToast } from "@/components/ui/Toast";
import { sendChat, pollTrainerMessages } from "@/lib/data/groups/chat-actions";
import { mergeMessages, latestCursor, TEMP_PREFIX } from "@/lib/chat/merge";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatMessageView, ChatRoomView } from "@/lib/types";

export function ChatRoomClient({ room }: { room: ChatRoomView }) {
  const showToast = useToast();
  const [messages, setMessages] = useState<ChatMessageView[]>(room.messages);
  const [draft, setDraft] = useState("");
  const cursorRef = useRef<string | null>(
    latestCursor(room.messages, room.cursor ?? null)
  );
  const tempSeq = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }

  usePolling(async () => {
    let incoming: ChatMessageView[] = [];
    try {
      incoming = await pollTrainerMessages(room.threadId, cursorRef.current);
    } catch {
      return; // transient failure — retry next tick
    }
    if (!incoming.length) return;
    setMessages((prev) => {
      const merged = mergeMessages(prev, incoming);
      cursorRef.current = latestCursor(merged, cursorRef.current);
      return merged;
    });
    scrollToBottom();
  }, 3000);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    const tempId = `${TEMP_PREFIX}${tempSeq.current++}`;
    setMessages((prev) => [...prev, { id: tempId, mine: true, text }]);
    setDraft("");
    scrollToBottom();
    const res = await sendChat(room.threadId, text);
    if (res.ok && res.message) {
      const real = res.message;
      setMessages((prev) => {
        const merged = mergeMessages(prev, [real]);
        cursorRef.current = latestCursor(merged, cursorRef.current);
        return merged;
      });
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast(res.error ?? "전송에 실패했어요.");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-none items-center gap-3 border-b border-ink/[0.06] px-[18px] py-2.5">
        <BackButton fallback="/t/chat" />
        {room.isTeam && room.team ? (
          <TeamAvatar team={room.team} size={34} />
        ) : (
          <Avatar initial={room.initial} tone={room.avatarTone} size={34} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-ink">{room.name}</span>
            {room.isTeam ? <Badge variant="team">2:1</Badge> : null}
          </div>
          <div className="truncate text-[11.5px] font-medium text-muted">{room.sub}</div>
        </div>
      </div>

      {/* messages */}
      <Body className="gap-2.5 py-3.5">
        {room.isTeam ? (
          <div className="mx-auto mb-1 rounded-full bg-chip-soft px-3 py-1 text-[11px] font-medium text-muted2">
            2:1 팀 채팅이에요
          </div>
        ) : null}
        <div className="mx-auto mb-1 rounded-full bg-chip-soft px-3 py-1 text-[11px] font-medium text-muted2">
          오늘
        </div>
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            mine={m.mine}
            sender={room.isTeam && !m.mine ? m.sender : undefined}
            text={m.text}
            time={m.time}
          />
        ))}
        <div ref={bottomRef} />
      </Body>

      {/* composer */}
      <ChatInput value={draft} onChange={setDraft} onSend={send} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Fallback: `bun run build`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/t/chat/[id]/ui.tsx"
git commit -m "feat(chat): trainer room polling + optimistic reconcile"
```

---

### Task 6: Member chat room — polling + optimistic reconcile

**Files:**
- Modify: `src/app/(app)/m/chat/ui.tsx`
- Modify: `src/app/(app)/m/chat/page.tsx` (pass `cursor`)

**Interfaces:**
- Consumes: `pollMemberMessages`, `sendMemberChat` (Task 4); `mergeMessages`, `latestCursor`, `TEMP_PREFIX` (Task 1); `usePolling` (Task 2); `useToast`; `ChatMessageView`; `getMemberChatRoom().cursor` (Task 4).

- [ ] **Step 1: Pass `cursor` from the page**

In `src/app/(app)/m/chat/page.tsx`, add the `cursor` prop:

```tsx
import { getMemberChatRoom } from "@/lib/data/groups/member";
import { MemberChatClient } from "./ui";

export default async function MemberChatPage() {
  const room = await getMemberChatRoom();

  return (
    <MemberChatClient
      trainerName={room.trainerName}
      initial={room.initial}
      sub={room.sub}
      messages={room.messages}
      cursor={room.cursor}
    />
  );
}
```

- [ ] **Step 2: Rewrite the member client component**

Replace the entire contents of `src/app/(app)/m/chat/ui.tsx` with:

```tsx
"use client";
import { useRef, useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { ChatInput } from "@/components/ui/ChatInput";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { sendMemberChat, pollMemberMessages } from "@/lib/data/groups/member-actions";
import { mergeMessages, latestCursor, TEMP_PREFIX } from "@/lib/chat/merge";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatMessageView } from "@/lib/types";

export function MemberChatClient({
  trainerName,
  initial,
  messages: initialMessages,
  cursor: initialCursor,
}: {
  trainerName: string;
  initial: string;
  sub: string;
  messages: ChatMessageView[];
  cursor: string | null;
}) {
  const showToast = useToast();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const cursorRef = useRef<string | null>(
    latestCursor(initialMessages, initialCursor)
  );
  const tempSeq = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }

  usePolling(async () => {
    let incoming: ChatMessageView[] = [];
    try {
      incoming = await pollMemberMessages(cursorRef.current);
    } catch {
      return;
    }
    if (!incoming.length) return;
    setMessages((prev) => {
      const merged = mergeMessages(prev, incoming);
      cursorRef.current = latestCursor(merged, cursorRef.current);
      return merged;
    });
    scrollToBottom();
  }, 3000);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    const tempId = `${TEMP_PREFIX}${tempSeq.current++}`;
    setMessages((prev) => [...prev, { id: tempId, mine: true, text }]);
    setDraft("");
    scrollToBottom();
    const res = await sendMemberChat(text);
    if (res.ok && res.message) {
      const real = res.message;
      setMessages((prev) => {
        const merged = mergeMessages(prev, [real]);
        cursorRef.current = latestCursor(merged, cursorRef.current);
        return merged;
      });
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast(res.error ?? "메시지를 보내지 못했어요");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-none items-center gap-2.5 border-b border-ink/[0.06] px-3 py-2.5">
        <BackButton fallback="/m" />
        <Avatar initial={initial} tone="sage" size={34} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold text-ink">{trainerName} 트레이너</span>
          <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-chip-soft px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
            <Icon name="lock" size={11} />
            담당 트레이너와만 대화
          </span>
        </div>
      </div>

      <Body className="gap-2.5 py-3">
        {/* date chip */}
        <div className="mb-1 flex justify-center">
          <span className="rounded-full bg-chip-soft px-2.5 py-1 text-[11px] font-medium text-muted">오늘</span>
        </div>
        {messages.map((m) => (
          <ChatBubble key={m.id} mine={m.mine} text={m.text} time={m.time} />
        ))}
        <div ref={bottomRef} />
      </Body>

      <ChatInput value={draft} onChange={setDraft} onSend={send} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Fallback: `bun run build`.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/m/chat/ui.tsx" "src/app/(app)/m/chat/page.tsx"
git commit -m "feat(chat): member room polling + optimistic reconcile"
```

---

### Task 7: Trainer thread list — live polling

**Files:**
- Create: `src/app/(app)/t/chat/ChatListClient.tsx`
- Modify: `src/app/(app)/t/chat/page.tsx`

**Interfaces:**
- Consumes: `pollChatThreads` (Task 3); `usePolling` (Task 2); `ChatThreadView`.

- [ ] **Step 1: Create the list client component**

Create `src/app/(app)/t/chat/ChatListClient.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { pollChatThreads } from "@/lib/data/groups/chat-actions";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatThreadView } from "@/lib/types";

export function ChatListClient({ initial }: { initial: ChatThreadView[] }) {
  const [threads, setThreads] = useState<ChatThreadView[]>(initial);

  usePolling(async () => {
    try {
      setThreads(await pollChatThreads());
    } catch {
      // transient failure — keep current list, retry next tick
    }
  }, 5000);

  return (
    <div className="flex flex-col">
      {threads.map((t) => (
        <Link
          key={t.id}
          href={`/t/chat/${t.id}`}
          className="tappable flex items-center gap-3 border-b border-ink/[0.06] py-3 last:border-b-0"
        >
          {t.isTeam && t.team ? (
            <TeamAvatar team={t.team} size={42} />
          ) : (
            <Avatar initial={t.initial} tone={t.avatarTone} size={42} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-bold text-ink">{t.name}</span>
              {t.isTeam ? <Badge variant="team">2:1</Badge> : null}
            </div>
            <div className="truncate text-[12.5px] font-medium text-muted">{t.preview}</div>
          </div>
          <div className="flex flex-none flex-col items-end gap-1">
            <span className="text-[11px] text-muted3">{t.time}</span>
            {t.unread > 0 ? (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-surface">
                {t.unread}
              </span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Use the client component + enable live badge in page**

Replace the entire contents of `src/app/(app)/t/chat/page.tsx` with:

```tsx
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Icon } from "@/components/ui/icon";
import {
  getChatThreads,
  getChatUnread,
  getMe,
  getMembersCount,
} from "@/lib/data/groups/chat";
import { trainerTabs } from "@/components/trainer/tabs";
import { ChatListClient } from "./ChatListClient";

export default async function TrainerChatListPage() {
  const [me, threads, totalMembers, chatUnread] = await Promise.all([
    getMe(),
    getChatThreads(),
    getMembersCount(),
    getChatUnread(),
  ]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[21px] font-bold text-ink">채팅</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-banner2 px-3 py-1.5 text-[12px] font-semibold text-[#5b6452]">
            <Icon name="persons" size={15} className="text-sage-deep" />
            담당회원 {totalMembers}
          </span>
        </div>

        {/* thread list (live) */}
        <ChatListClient initial={threads} />
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Fallback: `bun run build`.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/t/chat/ChatListClient.tsx" "src/app/(app)/t/chat/page.tsx"
git commit -m "feat(chat): live-polling trainer thread list"
```

---

### Task 8: Tab unread badge — live polling

**Files:**
- Modify: `src/components/shell/TabBar.tsx`
- Modify: `src/app/(app)/t/ui.tsx:149`
- Modify: `src/app/(app)/t/members/ui.tsx:106`
- Modify: `src/app/(app)/t/perf/page.tsx:106`
- Modify: `src/app/(app)/m/ui.tsx:98`
- Modify: `src/app/(app)/m/my/ui.tsx:193`

(`src/app/(app)/t/chat/page.tsx` already gained `liveChat` in Task 7.)

**Interfaces:**
- Consumes: `pollChatUnread` (Task 3); `usePolling` (Task 2).
- Produces: `TabBar` gains optional prop `liveChat?: boolean` (default false). When true it polls every 5s and overrides the badge on the tab whose `href` ends with `/chat`.

- [ ] **Step 1: Add live polling to TabBar**

In `src/components/shell/TabBar.tsx`, update the imports and the component signature/body. Replace the import block (lines 1-6) with:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { pollChatUnread } from "@/lib/data/groups/chat-actions";
import { usePolling } from "@/lib/hooks/usePolling";
import { cn } from "@/lib/cn";
```

Replace the function signature + the first two lines of the body (lines 19-21) with:

```tsx
export function TabBar({ tabs, liveChat = false }: { tabs: TabDef[]; liveChat?: boolean }) {
  const pathname = usePathname();
  const showToast = useToast();
  const initialUnread = tabs.find((t) => t.href?.endsWith("/chat"))?.badge ?? 0;
  const [liveUnread, setLiveUnread] = useState<number>(initialUnread);

  usePolling(
    async () => {
      try {
        setLiveUnread(await pollChatUnread());
      } catch {
        // keep last value on transient failure
      }
    },
    5000,
    liveChat
  );

  const effectiveTabs = liveChat
    ? tabs.map((t) =>
        t.href?.endsWith("/chat") ? { ...t, badge: liveUnread || undefined } : t
      )
    : tabs;
```

Then change the iteration from `{tabs.map((t) => {` to `{effectiveTabs.map((t) => {` (line 24).

- [ ] **Step 2: Pass `liveChat` at the five remaining TabBar sites**

In each file, add ` liveChat` to the `<TabBar ... />` element:

- `src/app/(app)/t/ui.tsx` (line ~149): `<TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />`
- `src/app/(app)/t/members/ui.tsx` (line ~106): `<TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />`
- `src/app/(app)/t/perf/page.tsx` (line ~106): `<TabBar tabs={trainerTabs({ isOwner, chatUnread })} liveChat />`
- `src/app/(app)/m/ui.tsx` (line ~98): `<TabBar tabs={memberTabs({ chatUnread })} liveChat />`
- `src/app/(app)/m/my/ui.tsx` (line ~193): `<TabBar tabs={memberTabs({ chatUnread })} liveChat />`

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Fallback: `bun run build`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/TabBar.tsx "src/app/(app)/t/ui.tsx" "src/app/(app)/t/members/ui.tsx" "src/app/(app)/t/perf/page.tsx" "src/app/(app)/m/ui.tsx" "src/app/(app)/m/my/ui.tsx"
git commit -m "feat(chat): live-polling tab unread badge"
```

---

### Task 9: Integration build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full unit test run**

Run: `bun test`
Expected: PASS (merge module tests).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: build completes with no type or compile errors.

- [ ] **Step 3: Manual two-client smoke test**

Run: `bun run dev`, then with two browser sessions (one trainer, one member of the same thread):
- Member sends a message → trainer's open room shows it within ~3s without refresh; trainer thread list preview/time and the chat tab badge update within ~5s.
- Trainer sends a message → member's open room shows it within ~3s; member chat tab badge updates within ~5s (and clears when the member opens/views the room).
- Sender sees their own message immediately (optimistic) with no duplicate after the server row arrives.
- Switch a tab to the background for >10s, then return → no errors; the room/list/badge refresh once immediately on return.
- Force a send failure (e.g. stop the dev server briefly) → optimistic message rolls back and a Korean toast appears.

- [ ] **Step 4: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "test(chat): verify polling end-to-end"
```

---

## Self-Review

**Spec coverage:**
- Polling approach (room 3s / list·badge 5s, visibility-paused) → Tasks 2, 5, 6, 7, 8. ✔
- Cursor `>=` + id-Set dedupe + `createdAt` on view → Task 1 (merge + type), Tasks 3/4 (populate). ✔
- Poll actions (`pollTrainerMessages`, `pollMemberMessages`, `pollChatUnread`, `pollChatThreads`) → Tasks 3, 4. ✔
- `sendChat`/`sendMemberChat` return created row; `router.refresh()` removed → Tasks 3, 4, 5, 6. ✔
- Thread list live update → Task 7. ✔
- Tab badge live update via `TabBar.liveChat` across 6 sites → Tasks 7, 8. ✔
- Error handling (silent poll skip, send rollback + toast) → Tasks 5, 6, 7, 8. ✔
- Tests for cursor/dedupe → Task 1; read-processing / context-detection covered by build + manual (DB-coupled, no test harness) → Task 9, as the spec's manual-verification path. ✔
- Out of scope (typing, attachments, delete, date dividers, Realtime) → untouched. ✔

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✔

**Type consistency:** `ChatMessageView.createdAt`, `ChatRoomView.cursor`, `{ ok, error?, message? }` send result, `pollTrainerMessages/pollMemberMessages/pollChatThreads/pollChatUnread`, `mergeMessages/latestCursor/isTempId/TEMP_PREFIX`, `usePolling(fn, ms, enabled)`, `TabBar.liveChat` — names/signatures match across producing and consuming tasks. ✔
