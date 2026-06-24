"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Kicker } from "@/components/ui/Kicker";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icon";
import { Stepper } from "@/components/ui/Stepper";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Combobox } from "@/components/ui/Select";
import { saveRecord } from "@/lib/data/groups/scheduling-actions";
import type { AvatarTone } from "@/lib/types";

type Exercise = { name: string; kg: number; sets: number };

type RecordTarget = {
  sessionId: string;
  memberId: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  dateLabel: string;
  exercises: Exercise[];
};

export default function RecordClient({
  target: t,
  exerciseOptions,
}: {
  target: RecordTarget;
  exerciseOptions: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [exercises, setExercises] = useState<Exercise[]>(t.exercises);
  const [comment, setComment] = useState("");

  const update = (i: number, patch: Partial<Exercise>) =>
    setExercises((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const save = async () => {
    await saveRecord(t.sessionId, exercises, comment || undefined);
    toast("기록이 저장되었어요");
    router.push("/t");
  };

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton icon="close" />
          <span className="flex-1 text-[19px] font-bold text-ink">운동 기록</span>
          <button
            type="button"
            onClick={save}
            className="tappable text-[14px] font-bold text-sage"
          >
            저장
          </button>
        </div>

        {/* member chip */}
        <div className="mb-5 flex items-center gap-2.5 rounded-[13px] bg-sage-banner2 px-3.5 py-2.5">
          <Avatar initial={t.initial} tone={t.avatarTone} size={30} />
          <span className="text-[13.5px] font-bold text-ink">{t.name}</span>
          <span className="text-[12.5px] font-medium text-muted2">{t.dateLabel}</span>
        </div>

        <div className="mb-2.5">
          <Kicker>운동 종목</Kicker>
        </div>

        <div className="flex flex-col gap-2.5">
          {exercises.map((ex, i) => (
            <div key={i} className="rounded-[14px] border border-ink/[0.08] bg-card p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="flex-1">
                  <Combobox
                    value={ex.name}
                    options={exerciseOptions}
                    onChange={(v) => update(i, { name: v })}
                    placeholder="종목 이름"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setExercises((prev) => prev.filter((_, idx) => idx !== i))}
                  className="tappable flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted4 hover:bg-ink/[0.06]"
                  aria-label="종목 삭제"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                <Stepper
                  value={ex.kg}
                  unit="kg"
                  onDec={() => update(i, { kg: Math.max(0, ex.kg - 5) })}
                  onInc={() => update(i, { kg: ex.kg + 5 })}
                />
                <Stepper
                  value={ex.sets}
                  unit="세트"
                  onDec={() => update(i, { sets: Math.max(0, ex.sets - 1) })}
                  onInc={() => update(i, { sets: ex.sets + 1 })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExercises((prev) => [...prev, { name: "", kg: 0, sets: 0 }])}
          className="tappable mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed border-sage-deep/40 py-3 text-[13.5px] font-bold text-sage-deep"
        >
          <Icon name="plus-bold" size={16} />
          종목 추가
        </button>

        {/* comment */}
        <div className="mt-3.5">
          <div className="mb-2">
            <Kicker>코멘트</Kicker>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="오늘 수업 코멘트를 남겨주세요…"
            rows={3}
            className="w-full rounded-[14px] border border-ink/[0.08] bg-card px-3.5 py-3 text-[13.5px] text-ink outline-none placeholder:text-placeholder focus:ring-2 focus:ring-sage/30 resize-none"
          />
        </div>
      </Body>

      <Footer>
        <PrimaryButton icon="check-bold" onClick={save}>
          기록 저장
        </PrimaryButton>
      </Footer>
    </div>
  );
}
