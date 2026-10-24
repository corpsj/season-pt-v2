"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { exerciseLine } from "@/lib/data/workout-format";
import {
  copySet,
  previousExercise,
  type SetValues,
  type WorkoutSet,
} from "@/lib/data/workout-sets";
import { DraftSaveQueue, type DraftSave } from "@/lib/data/draft-save-queue";
import type {
  ClassWorkspace,
  WorkflowResult,
  AttendanceOptions,
} from "@/lib/data/class-workflow-types";
import type { WorkoutExercise } from "@/lib/types";

type Props = {
  workspace: ClassWorkspace;
  exerciseOptions: { id: string; name: string }[];
  saveDraft: DraftSave;
  publish: (versions: Record<string, number>) => Promise<WorkflowResult>;
  complete: (
    signature: string,
    options: AttendanceOptions,
  ) => Promise<WorkflowResult>;
  correct: (options: AttendanceOptions) => Promise<WorkflowResult>;
  onFinished?: () => void;
};
const emptySet = (): WorkoutSet => ({
  id: crypto.randomUUID(),
  target: {},
  actual: {},
  completed: false,
});
const labels = {
  saved: "서버에 초안 저장됨",
  waiting: "변경 사항 저장 대기",
  saving: "초안 저장 중…",
  error: "저장하지 못했어요",
  conflict: "다른 기록과 충돌했어요",
};
const fieldClass =
  "h-12 w-full min-w-0 rounded-xl border border-ink/15 bg-white px-3 text-base font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:opacity-60";

export function ClassRecordEditor({
  workspace: w,
  exerciseOptions,
  saveDraft,
  publish,
  complete,
  correct,
  onFinished,
}: Props) {
  const [queue] = useState(() => new DraftSaveQueue(w.members, saveDraft));
  useEffect(() => {
    queue.setSave(saveDraft);
  }, [queue, saveDraft]);
  const snapshot = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );
  const [selected, setSelected] = useState(w.members[0]?.memberId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [allowFree, setAllowFree] = useState(false);
  const [reason, setReason] = useState("");
  const correction = useRef("");
  const [attendance, setAttendance] = useState({
    status: w.status,
    version: w.attendanceVersion,
  });
  const operation = useRef("");
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = `spt-class-draft:${w.editorId}:${w.sessionId}`;
  const m =
    snapshot.members.find((m) => m.memberId === selected) ??
    snapshot.members[0];

  useEffect(() => {
    try {
      queue.restore(sessionStorage.getItem(storageKey));
    } catch {
      queue.setRecoveryAvailable(false);
    }
    queue.setPersistence((value) => {
      try {
        if (value) sessionStorage.setItem(storageKey, value);
        else sessionStorage.removeItem(storageKey);
      } catch {
        queue.setRecoveryAvailable(false);
      }
    });
    return () => {
      queue.setPersistence();
    };
  }, [queue, storageKey]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.dirty() || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [queue, busy]);
  useEffect(() => {
    if (snapshot.status !== "waiting") return;
    const timer = setTimeout(() => {
      void queue.flush();
    }, 700);
    return () => clearTimeout(timer);
  }, [queue, snapshot.members, snapshot.status]);
  useEffect(() => {
    if (finishing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [finishing]);

  function exercises(next: WorkoutExercise[]) {
    queue.update(m.memberId, { exercises: next, comment: m.comment });
  }
  function updateExercise(index: number, patch: Partial<WorkoutExercise>) {
    exercises(
      m.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );
  }
  function updateSet(
    index: number,
    rowIndex: number,
    patch: Partial<WorkoutSet>,
  ) {
    const e = m.exercises[index];
    updateExercise(index, {
      setRows: e.setRows?.map((s, i) =>
        i === rowIndex ? { ...s, ...patch } : s,
      ),
    });
  }
  function usePrevious() {
    exercises(
      m.previous.map((e) => ({
        name: e.name,
        exerciseId: e.exerciseId,
        kg: 0,
        sets: 0,
        setRows: (
          e.setRows ??
          Array.from({ length: Math.min(e.sets, 40) }, (_, i) => ({
            id: `legacy-${i}`,
            actual: { kg: e.kg, reps: e.reps },
            target: {},
            completed: true,
          }))
        ).map((s) => ({
          id: crypto.randomUUID(),
          target: { ...(s.completed ? s.actual : s.target) },
          actual: {},
          completed: false,
        })),
      })),
    );
  }
  async function share() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (!(await queue.flush())) return;
      const r = await publish(queue.versions());
      setMessage(
        r.ok
          ? "오늘 기록을 회원에게 공유했어요."
          : (r.error ?? "공유하지 못했어요."),
      );
    } catch {
      setMessage("공유 결과를 확인하지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function openFinish() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (await queue.flush()) {
        operation.current = crypto.randomUUID();
        setSignature(null);
        setFinishing(true);
      }
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (busy || !signature) return;
    setBusy(true);
    setMessage("");
    try {
      if (!(await queue.flush())) return;
      const r = await complete(signature, {
        operationId: operation.current,
        expectedVersion: attendance.version,
        versions: queue.versions(),
        allowFree,
      });
      if (!r.ok) {
        setMessage(r.error ?? "완료하지 못했어요.");
        return;
      }
      if (r.balances) queue.updateBalances(r.balances);
      setAttendance({
        status: "attended",
        version: r.version ?? attendance.version + 1,
      });
      setFinishing(false);
      setMessage(
        "기록 공유와 출석 처리를 완료했어요. 회차는 서버에서 한 번만 처리했어요.",
      );
      onFinished?.();
    } catch {
      setMessage(
        "완료 결과를 확인하지 못했어요. 같은 요청으로 다시 시도해주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restoreAttendance() {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setMessage("");
    correction.current ||= crypto.randomUUID();
    try {
      const r = await correct({
        operationId: correction.current,
        expectedVersion: attendance.version,
        reason,
      });
      if (!r.ok) {
        setMessage(r.error ?? "정정하지 못했어요.");
        return;
      }
      if (r.balances) queue.updateBalances(r.balances);
      setAttendance({
        status: "scheduled",
        version: r.version ?? attendance.version + 1,
      });
      correction.current = "";
      setReason("");
      setMessage(
        "처리를 정정하고 원래 회원권에 회차를 복원했어요. 이전 이력은 남아 있어요.",
      );
      onFinished?.();
    } catch {
      setMessage(
        "정정 결과를 확인하지 못했어요. 같은 요청으로 다시 시도해주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  function numberInput(
    value: number | undefined,
    onChange: (v: number | undefined) => void,
    label: string,
    integer = false,
  ) {
    return (
      <input
        aria-label={label}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        min="0"
        max={integer ? 999 : 9999}
        step={integer ? 1 : 0.25}
        value={value ?? ""}
        placeholder={integer ? "회" : "kg"}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        className={fieldClass}
      />
    );
  }
  if (!m) return null;
  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <header className="mb-4 flex items-center gap-3">
          <BackButton
            fallback={`/t/class/${w.sessionId}`}
            beforeNavigate={() =>
              (!queue.dirty() && !busy) ||
              window.confirm(
                busy
                  ? "아직 저장 또는 수업 처리가 끝나지 않았어요. 화면을 나갈까요?"
                  : "아직 서버에 저장하지 못한 입력이 있어요. 화면을 나갈까요?",
              )
            }
          />
          <div>
            <h1 className="text-xl font-bold text-ink">오늘 수업 기록</h1>
            <p className="mt-1 text-xs text-muted">{w.dateLabel}</p>
          </div>
        </header>
        <div className="mb-4 flex gap-2" aria-label="기록할 회원">
          {snapshot.members.map((member) => (
            <button
              key={member.memberId}
              onClick={() => setSelected(member.memberId)}
              aria-pressed={selected === member.memberId}
              className={`min-h-12 min-w-0 flex-1 rounded-2xl px-3 py-2 text-sm font-bold ${selected === member.memberId ? "bg-sage text-white" : "border border-ink/10 bg-card text-ink"}`}
            >
              {member.name}
              <span className="mt-1 block text-xs font-medium opacity-80">
                남은 수업 {member.remaining}회
              </span>
            </button>
          ))}
        </div>
        <div
          className={`mb-4 rounded-xl px-3 py-3 text-xs leading-relaxed ${snapshot.status === "error" || snapshot.status === "conflict" ? "bg-[#FBF3E9] text-terracotta-deep" : "bg-sage-banner2 text-sage-deep"}`}
        >
          <p role="status" aria-live="polite" className="font-bold">
            {labels[snapshot.status]}
          </p>
          <p className="mt-1">
            {snapshot.error ||
              "초안은 선생님만 볼 수 있어요. 공유하거나 수업을 완료하면 회원에게 보여요."}
          </p>
          {snapshot.status === "error" ? (
            <button
              onClick={() => void queue.flush()}
              className="mt-2 min-h-11 font-bold underline"
            >
              저장 다시 시도
            </button>
          ) : null}
          {snapshot.status === "conflict" ? (
            <button
              onClick={() => {
                if (window.confirm("복구 입력을 버리고 서버 기록을 열까요?")) {
                  sessionStorage.removeItem(storageKey);
                  window.location.reload();
                }
              }}
              className="mt-2 min-h-11 font-bold underline"
            >
              복구 입력 버리고 서버 기록 열기
            </button>
          ) : null}
        </div>
        <fieldset disabled={busy} className="min-w-0 border-0 p-0">
          <section className="mb-4 rounded-2xl border border-ink/10 bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">지난 운동</h2>
              <span className="text-xs text-muted">
                {m.previousDate ?? "기록 없음"}
              </span>
            </div>
            {m.previous.length ? (
              <>
                <ul className="mt-2 space-y-2 text-xs text-muted">
                  {m.previous.map((e, i) => (
                    <li key={i}>
                      <span className="font-semibold text-ink">{e.name}</span>
                      <span className="ml-2">{exerciseLine(e)}</span>
                    </li>
                  ))}
                </ul>
                {!m.exercises.length ? (
                  <button
                    onClick={usePrevious}
                    className="mt-3 min-h-11 w-full rounded-xl bg-sage-banner2 text-sm font-bold text-sage-deep"
                  >
                    지난 구성을 오늘 목표로 가져오기
                  </button>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">
                처음 기록하는 수업이에요.
              </p>
            )}
          </section>
          <h2 className="mb-2 text-sm font-bold">오늘의 세트</h2>
          <datalist id="class-exercises">
            {exerciseOptions.map((e) => (
              <option key={e.id} value={e.name} />
            ))}
          </datalist>
          <div className="space-y-4">
            {m.exercises.map((e, i) => {
              const prev = previousExercise(m.previous, e);
              return (
                <section
                  key={i}
                  className="rounded-2xl border border-ink/10 bg-card p-3.5"
                >
                  <div className="mb-3 flex gap-2">
                    <input
                      aria-label={`운동 ${i + 1} 이름`}
                      list="class-exercises"
                      value={e.name}
                      maxLength={80}
                      placeholder="운동 이름"
                      onChange={(ev) =>
                        updateExercise(i, {
                          name: ev.target.value,
                          exerciseId: exerciseOptions.find(
                            (o) => o.name === ev.target.value,
                          )?.id,
                        })
                      }
                      className={`${fieldClass} flex-1`}
                    />
                    <button
                      aria-label={`운동 ${i + 1} 제거`}
                      onClick={() =>
                        exercises(m.exercises.filter((_, n) => n !== i))
                      }
                      className="min-h-12 min-w-11 text-muted"
                    >
                      ×
                    </button>
                  </div>
                  {!e.setRows ? (
                    <p className="mb-3 rounded-xl bg-chip-soft p-3 text-xs">
                      기존 요약 · {exerciseLine(e)}
                      <span className="mt-1 block text-muted">
                        과거 세트별 값은 남아 있지 않아요.
                      </span>
                    </p>
                  ) : null}
                  <div className="space-y-3">
                    {e.setRows?.map((row, j) => {
                      const last = prev?.setRows?.[j];
                      const lastValue = last?.completed
                        ? last.actual
                        : prev && !prev.setRows
                          ? { kg: prev.kg, reps: prev.reps }
                          : null;
                      const change = (
                        kind: "target" | "actual",
                        key: keyof SetValues,
                        v: number | undefined,
                      ) =>
                        updateSet(i, j, {
                          [kind]: { ...row[kind], [key]: v },
                          ...(kind === "actual" ? { completed: false } : {}),
                        });
                      return (
                        <div
                          key={row.id}
                          className={`rounded-xl p-3 ${row.completed ? "bg-sage-banner2" : "bg-[#F4F0E8]"}`}
                        >
                          <div className="mb-2 flex justify-between gap-2 text-xs">
                            <b>{j + 1}세트</b>
                            <span className="text-muted">
                              지난 수행{" "}
                              {lastValue
                                ? `${lastValue.kg ?? "—"}kg · ${lastValue.reps ?? "—"}회`
                                : "—"}
                            </span>
                          </div>
                          <details className="mb-2 text-xs text-muted">
                            <summary className="min-h-8 cursor-pointer leading-8">
                              목표 {row.target.kg ?? "—"}kg ·{" "}
                              {row.target.reps ?? "—"}회 · 수정
                            </summary>
                            <div className="mb-2 grid grid-cols-2 gap-2">
                              {numberInput(
                                row.target.kg,
                                (v) => change("target", "kg", v),
                                `${e.name} ${j + 1}세트 목표 kg`,
                              )}
                              {numberInput(
                                row.target.reps,
                                (v) => change("target", "reps", v),
                                `${e.name} ${j + 1}세트 목표 횟수`,
                                true,
                              )}
                            </div>
                          </details>
                          <div className="grid grid-cols-[38px_1fr_1fr] items-center gap-2">
                            <span className="text-xs font-bold">실제</span>
                            {numberInput(
                              row.actual.kg,
                              (v) => change("actual", "kg", v),
                              `${e.name} ${j + 1}세트 실제 kg`,
                            )}
                            {numberInput(
                              row.actual.reps,
                              (v) => change("actual", "reps", v),
                              `${e.name} ${j + 1}세트 실제 횟수`,
                              true,
                            )}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() =>
                                updateSet(i, j, {
                                  actual: { ...row.target },
                                  completed: false,
                                })
                              }
                              className="min-h-11 flex-1 rounded-xl border border-ink/10 bg-white text-xs font-semibold"
                            >
                              목표 값 넣기
                            </button>
                            <button
                              onClick={() => {
                                if (row.actual.reps == null) {
                                  setMessage(
                                    "실제 횟수를 입력한 뒤 완료해주세요.",
                                  );
                                  return;
                                }
                                updateSet(i, j, { completed: !row.completed });
                              }}
                              aria-pressed={row.completed}
                              className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${row.completed ? "bg-white text-sage-deep" : "bg-sage text-white"}`}
                            >
                              {row.completed ? "완료 취소" : "세트 완료"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        updateExercise(i, {
                          setRows: [...(e.setRows ?? []), emptySet()],
                        })
                      }
                      disabled={(e.setRows?.length ?? 0) >= 40}
                      className="min-h-12 flex-1 rounded-xl border border-dashed border-sage/50 text-sm font-bold text-sage-deep"
                    >
                      + 세트 추가
                    </button>
                    {e.setRows?.length ? (
                      <button
                        onClick={() =>
                          updateExercise(i, {
                            setRows: [
                              ...e.setRows!,
                              copySet(e.setRows!.at(-1)!, crypto.randomUUID()),
                            ],
                          })
                        }
                        disabled={e.setRows.length >= 40}
                        className="min-h-12 flex-1 rounded-xl bg-chip-soft text-sm font-bold"
                      >
                        마지막 세트 복사
                      </button>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
          <button
            onClick={() =>
              exercises([
                ...m.exercises,
                { name: "", kg: 0, sets: 0, setRows: [emptySet()] },
              ])
            }
            disabled={m.exercises.length >= 30}
            className="my-3 min-h-12 w-full rounded-2xl border border-dashed border-sage/60 text-sm font-bold text-sage-deep"
          >
            + 운동 추가
          </button>
          <label className="block text-sm font-bold">
            회원에게 공유할 코멘트
            <textarea
              maxLength={2000}
              value={m.comment}
              onChange={(e) =>
                queue.update(m.memberId, {
                  exercises: m.exercises,
                  comment: e.target.value,
                })
              }
              className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-ink/15 bg-card p-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-sage"
              placeholder="오늘의 변화와 다음 운동에서 기억할 점"
            />
          </label>
          <button
            onClick={share}
            disabled={snapshot.status === "conflict"}
            className="my-3 min-h-12 w-full rounded-2xl border border-sage text-sm font-bold text-sage-deep"
          >
            오늘 기록만 회원에게 공유
          </button>
        </fieldset>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          남은 수업은 출석 확정 때 서버에서 차감해요.{" "}
          {snapshot.recoveryAvailable
            ? "이 탭의 저장 전 입력은 새로고침 후 복구할 수 있지만 탭을 닫으면 마지막 서버 초안까지만 남아요."
            : "이 브라우저에서는 탭 임시 복구를 사용할 수 없어요. 화면을 닫기 전에 서버 저장 완료를 확인해주세요."}
        </p>
        {attendance.status !== "scheduled" ? (
          <details className="mb-3 rounded-xl border border-ink/10 p-3">
            <summary className="min-h-9 cursor-pointer text-sm font-bold">
              수업 처리 정정
            </summary>
            <p className="my-2 text-xs text-muted">
              출석·노쇼·취소 처리를 예정으로 되돌리고 차감된 원래 회원권에
              복원해요. 운동 기록과 이전 이력은 유지돼요.
            </p>
            <label className="text-xs font-semibold">
              정정 사유
              <input
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                className={`${fieldClass} mt-2`}
              />
            </label>
            <button
              disabled={busy || !reason.trim()}
              onClick={restoreAttendance}
              className="mt-2 min-h-12 w-full rounded-xl bg-chip-soft text-sm font-bold disabled:opacity-50"
            >
              회차 복원하고 예정으로 정정
            </button>
          </details>
        ) : null}
        {w.history?.length ? (
          <details className="mb-3 rounded-xl border border-ink/10 p-3">
            <summary className="min-h-9 cursor-pointer text-sm font-bold">
              처리 이력 {w.history.length}건
            </summary>
            <ul className="space-y-2 text-xs">
              {w.history.map((h, i) => (
                <li key={i}>
                  {(
                    {
                      attend: "출석",
                      noshow: "노쇼",
                      cancel: "취소",
                      revert: "정정",
                    } as Record<string, string>
                  )[h.action] ?? h.action}{" "}
                  ·{" "}
                  {new Date(h.at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                  {h.reason ? ` · ${h.reason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {message ? (
          <p
            role="status"
            className="mb-3 rounded-xl bg-chip-soft p-3 text-sm font-semibold"
          >
            {message}
          </p>
        ) : null}
      </Body>
      <Footer>
        <button
          onClick={openFinish}
          disabled={
            busy ||
            w.canComplete === false ||
            attendance.status !== "scheduled" ||
            snapshot.status === "conflict"
          }
          className="min-h-14 w-full rounded-2xl bg-sage px-4 text-base font-bold text-white disabled:opacity-50"
        >
          {w.canComplete === false
            ? "수업 당일부터 완료할 수 있어요"
            : busy
              ? "저장 중…"
              : attendance.status === "attended"
                ? "수업 완료됨"
                : attendance.status !== "scheduled"
                  ? "이미 처리된 수업"
                  : "기록 공유하고 수업 완료"}
        </button>
      </Footer>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setFinishing(false);
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-32px)] max-w-sm overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-xl backdrop:bg-ink/40"
        aria-labelledby="class-finish-title"
      >
        <h2 id="class-finish-title" className="text-lg font-bold">
          수업을 완료할까요?
        </h2>
        <p className="my-3 text-sm leading-relaxed text-muted">
          회원별 기록을 공유하고 함께 출석 처리해요. 완료한 실제 세트만 수행
          기록으로 표시해요.
        </p>
        <ul className="mb-4 space-y-1 text-sm">
          {snapshot.members.map((member) => (
            <li key={member.memberId}>
              {member.name} · 잔여 {member.remaining}회 →{" "}
              {Math.max(0, member.remaining - 1)}회
            </li>
          ))}
        </ul>
        {snapshot.members.some((member) => member.remaining <= 0) ? (
          <label className="mb-4 flex min-h-12 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowFree}
              onChange={(e) => setAllowFree(e.target.checked)}
            />
            회차 없는 회원은 무료 수업으로 기록
          </label>
        ) : null}
        <p className="mb-2 text-sm font-bold">
          회원 확인 서명{snapshot.members.length > 1 ? " (팀 대표 1명)" : ""}
        </p>
        <SignaturePad onChange={setSignature} />
        {message ? (
          <p role="alert" className="mt-2 text-sm text-terracotta-deep">
            {message}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            disabled={busy}
            onClick={() => setFinishing(false)}
            className="min-h-12 flex-1 rounded-xl bg-chip-soft text-sm font-bold"
          >
            계속 기록
          </button>
          <button
            disabled={busy || !signature}
            onClick={finish}
            className="min-h-12 flex-1 rounded-xl bg-sage text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "완료 처리 중…" : "출석 확정"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
