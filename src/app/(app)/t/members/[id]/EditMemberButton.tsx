"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { useToast } from "@/components/ui/Toast";
import { updateMember } from "@/lib/data/groups/owner-ops-actions";
import type { Gender } from "@/lib/types";

/** 대표 전용: 회원 이름·연락처·성별·부상메모 수정(오타 연락처 등 잦은 데스크 업무). */
export function EditMemberButton({
  id,
  name,
  phone,
  gender,
  injury,
}: {
  id: string;
  name: string;
  phone: string;
  gender: Gender | null;
  injury?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({ name, phone, gender: (gender ?? "female") as Gender, injury: injury ?? "" });

  function save() {
    startTransition(async () => {
      const r = await updateMember(id, { name: f.name, phone: f.phone, gender: f.gender, injuryNote: f.injury });
      if (r.ok) {
        toast("회원 정보를 수정했어요");
        setOpen(false);
        router.refresh();
      } else {
        toast(r.error ?? "수정에 실패했어요");
      }
    });
  }

  return (
    <>
      <OutlineButton icon="pencil" onClick={() => setOpen(true)} className="flex-1">
        정보 수정
      </OutlineButton>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(38,35,30,0.42)] sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-[20px] bg-card p-5 sm:rounded-[20px]"
          >
            <div className="mb-3.5 text-[16px] font-bold text-ink">회원 정보 수정</div>
            <div className="flex flex-col gap-3">
              <Field icon="person" label="이름">
                <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
              <Field icon="phone" label="연락처">
                <TextInput
                  value={f.phone}
                  onChange={(e) => setF({ ...f, phone: e.target.value })}
                  inputMode="numeric"
                  placeholder="01012345678"
                />
              </Field>
              <div>
                <div className="mb-2 text-[12.5px] font-semibold text-muted5">성별</div>
                <SegmentedToggle
                  value={f.gender}
                  onChange={(v) => setF({ ...f, gender: v })}
                  options={[
                    { value: "female", label: "여성" },
                    { value: "male", label: "남성" },
                  ]}
                />
              </div>
              <Field icon="triangle-exclamation" label="부상 메모 (선택)">
                <TextInput
                  value={f.injury}
                  onChange={(e) => setF({ ...f, injury: e.target.value })}
                  placeholder="예: 오른쪽 무릎 주의"
                />
              </Field>
            </div>
            <div className="mt-4 flex gap-2.5">
              <OutlineButton onClick={() => setOpen(false)} className="flex-1">
                취소
              </OutlineButton>
              <PrimaryButton onClick={save} disabled={pending} className="flex-1">
                저장
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
