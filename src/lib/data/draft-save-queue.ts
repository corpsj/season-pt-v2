import type {
  WorkspaceMember,
  WorkoutDraft,
  WorkflowResult,
} from "./class-workflow-types";
import { parseWorkoutExercises } from "./workout-sets";

export type DraftSave = (
  memberId: string,
  draft: WorkoutDraft,
) => Promise<WorkflowResult>;
export type DraftSnapshot = {
  members: WorkspaceMember[];
  recoveryAvailable: boolean;
  status: "saved" | "waiting" | "saving" | "error" | "conflict";
  error: string;
};
const payload = (d: WorkoutDraft) =>
  JSON.stringify({
    exercises: parseWorkoutExercises(d.exercises),
    comment: d.comment,
  });

/** Serial writes + per-member CAS. Edits made during a request remain dirty. */
export class DraftSaveQueue {
  private state: DraftSnapshot;
  private saved = new Map<string, string>();
  private listeners = new Set<() => void>();
  private pending: Promise<boolean> | null = null;
  private blocked = false;
  private onPersist?: (value: string | null) => void;
  setPersistence(fn?: (value: string | null) => void) {
    this.onPersist = fn;
  }
  setSave(fn: DraftSave) {
    this.save = fn;
  }
  constructor(
    members: WorkspaceMember[],
    private save: DraftSave,
  ) {
    this.state = {
      members,
      recoveryAvailable: true,
      status: "saved",
      error: "",
    };
    for (const m of members) this.saved.set(m.memberId, payload(m));
  }
  getSnapshot = () => this.state;
  setRecoveryAvailable(available: boolean) {
    if (this.state.recoveryAvailable !== available)
      this.emit({ recoveryAvailable: available });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<DraftSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.onPersist?.(this.recovery());
    for (const fn of this.listeners) fn();
  }
  dirty = () =>
    this.state.members.some((m) => this.saved.get(m.memberId) !== payload(m));
  update(memberId: string, patch: Pick<WorkoutDraft, "exercises" | "comment">) {
    this.emit({
      members: this.state.members.map((m) =>
        m.memberId === memberId ? { ...m, ...patch } : m,
      ),
      status: this.blocked ? "conflict" : "waiting",
      error: this.blocked ? this.state.error : "",
    });
  }
  versions = () =>
    Object.fromEntries(this.state.members.map((m) => [m.memberId, m.version]));
  updateBalances(balances: NonNullable<WorkflowResult["balances"]>) {
    this.emit({
      members: this.state.members.map((m) => {
        const b = balances.find((b) => b.memberId === m.memberId);
        const remaining = b?.totalRemaining ?? b?.remaining;
        return remaining != null ? { ...m, remaining } : m;
      }),
    });
  }
  recovery(): string | null {
    const members = this.state.members
      .filter((m) => this.saved.get(m.memberId) !== payload(m))
      .map(({ memberId, exercises, comment, version }) => ({
        memberId,
        exercises,
        comment,
        version,
      }));
    return members.length
      ? JSON.stringify({ schema: 1, at: Date.now(), members })
      : null;
  }
  restore(raw: string | null) {
    if (!raw) return;
    try {
      const r = JSON.parse(raw);
      if (
        r.schema !== 1 ||
        typeof r.at !== "number" ||
        !Number.isFinite(r.at) ||
        r.at > Date.now() + 60000 ||
        Date.now() - r.at > 12 * 3600000 ||
        !Array.isArray(r.members) ||
        raw.length > 200000
      )
        return;
      const members = this.state.members.map((m) => {
        const local = r.members.find(
          (d: WorkspaceMember) => d.memberId === m.memberId,
        );
        if (
          !local ||
          !Array.isArray(local.exercises) ||
          typeof local.comment !== "string"
        )
          return m;
        if (payload(local) === payload(m)) return m;
        if (local.version !== m.version) this.blocked = true;
        return {
          ...m,
          exercises: parseWorkoutExercises(local.exercises),
          comment: local.comment.slice(0, 2000),
        };
      });
      this.emit({
        members,
        status: this.blocked ? "conflict" : "waiting",
        error: this.blocked
          ? "복구한 입력과 서버 기록이 달라요. 서버 기록을 확인한 뒤 다시 저장해주세요."
          : "이 탭의 저장 전 입력을 복구했어요.",
      });
    } catch {
      /* Invalid local recovery is ignored; server data remains authoritative. */
    }
  }
  retryAfterConflict() {
    this.blocked = false;
    this.emit({ status: "waiting", error: "" });
  }
  flush = (): Promise<boolean> => {
    if (this.pending) return this.pending;
    if (this.blocked) return Promise.resolve(false);
    this.pending = this.run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  };
  private async run() {
    while (this.dirty()) {
      const m = this.state.members.find(
        (m) => this.saved.get(m.memberId) !== payload(m),
      )!;
      const captured = payload(m);
      this.emit({ status: "saving", error: "" });
      let r: WorkflowResult;
      try {
        r = await this.save(m.memberId, {
          exercises: m.exercises,
          comment: m.comment,
          version: m.version,
        });
      } catch {
        r = {
          ok: false,
          error: "연결하지 못했어요. 입력은 이 탭에 남아 있어요.",
        };
      }
      if (!r.ok || r.version == null) {
        this.blocked = !!r.conflict;
        this.emit({
          status: r.conflict ? "conflict" : "error",
          error: r.error ?? "저장에 실패했어요.",
        });
        return false;
      }
      this.saved.set(m.memberId, captured);
      this.emit({
        members: this.state.members.map((current) =>
          current.memberId === m.memberId
            ? { ...current, version: r.version! }
            : current,
        ),
      });
    }
    this.emit({ status: "saved", error: "" });
    return true;
  }
}
