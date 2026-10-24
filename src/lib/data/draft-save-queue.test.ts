import { expect, test } from "bun:test";
import { DraftSaveQueue } from "./draft-save-queue";
import type { WorkspaceMember, WorkflowResult } from "./class-workflow-types";
const member = (id = "a"): WorkspaceMember => ({
  memberId: id,
  name: "합성 회원",
  initial: "합",
  avatarTone: "sage",
  remaining: 2,
  exercises: [],
  comment: "",
  version: 0,
  previous: [],
  previousDate: null,
});

test("edits while saving and a second member are serialized without losing the latest input", async () => {
  let release!: (v: WorkflowResult) => void;
  const calls: { id: string; comment: string; version: number }[] = [];
  const q = new DraftSaveQueue([member(), member("b")], async (id, d) => {
    calls.push({ id, comment: d.comment, version: d.version });
    if (calls.length === 1)
      return new Promise((resolve) => {
        release = resolve;
      });
    return { ok: true, version: d.version + 1 };
  });
  q.update("a", { exercises: [], comment: "first" });
  const saving = q.flush();
  q.update("a", { exercises: [], comment: "latest" });
  q.update("b", { exercises: [], comment: "partner" });
  expect(q.flush()).toBe(saving);
  release({ ok: true, version: 1 });
  expect(await saving).toBe(true);
  expect(calls).toEqual([
    { id: "a", comment: "first", version: 0 },
    { id: "a", comment: "latest", version: 1 },
    { id: "b", comment: "partner", version: 0 },
  ]);
  expect(q.getSnapshot().status).toBe("saved");
  expect(q.dirty()).toBe(false);
});
test("network failure retains input; reload recovery retries against the original server version", async () => {
  const failed = new DraftSaveQueue([member()], async () => {
    throw new Error("offline");
  });
  failed.update("a", { exercises: [], comment: "recover me" });
  expect(await failed.flush()).toBe(false);
  expect(failed.getSnapshot().status).toBe("error");
  let seen = "";
  const restored = new DraftSaveQueue([member()], async (_, d) => {
    seen = d.comment;
    return { ok: true, version: 1 };
  });
  restored.restore(failed.recovery());
  expect(restored.getSnapshot().members[0].comment).toBe("recover me");
  expect(await restored.flush()).toBe(true);
  expect(seen).toBe("recover me");
  expect(restored.recovery()).toBeNull();
});
test("conflict never automatically overwrites another tab; stale local recovery is blocked", async () => {
  let calls = 0;
  const q = new DraftSaveQueue([member()], async () => {
    calls++;
    return { ok: false, conflict: true };
  });
  q.update("a", { exercises: [], comment: "local" });
  await q.flush();
  await q.flush();
  expect(calls).toBe(1);
  const latest = new DraftSaveQueue(
    [{ ...member(), version: 2, comment: "server" }],
    async () => {
      throw new Error("must not write");
    },
  );
  latest.restore(q.recovery());
  expect(latest.getSnapshot().status).toBe("conflict");
  expect(await latest.flush()).toBe(false);
});
test("recovery only applies to authorized workspace members and expires", () => {
  const q = new DraftSaveQueue([member()], async () => ({
    ok: true,
    version: 1,
  }));
  q.restore(
    JSON.stringify({
      schema: 1,
      at: Date.now(),
      members: [{ ...member("foreign"), comment: "do not restore" }],
    }),
  );
  expect(q.getSnapshot().members[0].comment).toBe("");
  q.restore(
    JSON.stringify({
      schema: 1,
      at: Date.now() - 13 * 3600000,
      members: [{ ...member(), comment: "expired" }],
    }),
  );
  expect(q.getSnapshot().members[0].comment).toBe("");
});

test("lost response whose payload reached the server recovers without a false key-order conflict", async () => {
  const local = new DraftSaveQueue([member()], async () => {
    throw new Error("lost reply");
  });
  const ex = {
    name: "스쿼트",
    sets: 0,
    kg: 0,
    setRows: [
      {
        id: "set",
        target: { reps: 10, kg: 22.5 },
        actual: {},
        completed: false,
      },
    ],
  };
  local.update("a", { exercises: [ex], comment: "same" });
  await local.flush();
  const server = {
    ...member(),
    version: 1,
    exercises: [
      {
        ...ex,
        setRows: [{ ...ex.setRows[0], target: { kg: 22.5, reps: 10 } }],
      },
    ],
    comment: "same",
  };
  let calls = 0;
  const q = new DraftSaveQueue([server], async () => {
    calls++;
    return { ok: true, version: 2 };
  });
  q.restore(local.recovery());
  expect(await q.flush()).toBe(true);
  expect(calls).toBe(0);
});
