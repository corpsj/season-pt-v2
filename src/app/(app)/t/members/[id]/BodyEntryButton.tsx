"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { Field, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { saveBodyComposition } from "@/lib/data/groups/body-actions";

/** 강사/대표가 회원 체성분(체중·골격근·체지방)을 기록. 측정일 기본 오늘. */
export function BodyEntryButton({ memberId, today }: { memberId: string; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ weight: "", skeletalMuscle: "", bodyFat: "", measuredAt: today });

  function reset() {
    setF({ weight: "", skeletalMuscle: "", bodyFat: "", measuredAt: today });
  }

  function save() {
    if (!f.weight && !f.skeletalMuscle && !f.bodyFat) {
      toast("한 가지 이상 입력해 주세요", "error");
      return;
    }
    start(async () => {
      const r = await saveBodyComposition(memberId, {
        weight: f.weight,
        skeletalMuscle: f.skeletalMuscle,
        bodyFat: f.bodyFat,
        measuredAt: f.measuredAt,
      });
      if (r.ok) {
        toast("체성분을 기록했어요");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast(r.error ?? "저장에 실패했어요", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 text-[12px] font-semibold text-surface"
      >
        <Icon name="plus" size={13} />기록
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(38,35,30,0.42)] sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-[20px] bg-card p-5 sm:rounded-[20px]"
          >
            <div className="mb-3.5 text-[16px] font-bold text-ink">체성분 기록</div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="체중 (kg)" rowClassName="px-3 py-[13px]">
                  <TextInput inputMode="decimal" placeholder="0" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
                </Field>
                <Field label="골격근 (kg)" rowClassName="px-3 py-[13px]">
                  <TextInput inputMode="decimal" placeholder="0" value={f.skeletalMuscle} onChange={(e) => setF({ ...f, skeletalMuscle: e.target.value })} />
                </Field>
                <Field label="체지방 (%)" rowClassName="px-3 py-[13px]">
                  <TextInput inputMode="decimal" placeholder="0" value={f.bodyFat} onChange={(e) => setF({ ...f, bodyFat: e.target.value })} />
                </Field>
              </div>
              <Field icon="calendar" label="측정일">
                <TextInput type="date" value={f.measuredAt} max={today} onChange={(e) => setF({ ...f, measuredAt: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4 flex gap-2.5">
              <OutlineButton onClick={() => setOpen(false)} className="flex-1">취소</OutlineButton>
              <PrimaryButton onClick={save} pending={pending} className="flex-1">저장</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
