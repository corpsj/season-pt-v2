"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { Field, TextInput } from "@/components/ui/Field";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { updateMember } from "@/lib/data/groups/owner-ops-actions";
import type { Gender, DiscountItem } from "@/lib/types";

/** 대표 전용: 회원 이름·연락처·성별·부상메모·생년월일·할인 자격 수정(오타 연락처 등 잦은 데스크 업무). 생년월일 변경은 비번 초기화+잠금 해제 겸용. */
export function EditMemberButton({
  id,
  name,
  phone,
  gender,
  injury,
  discounts,
  current,
}: {
  id: string;
  name: string;
  phone: string;
  gender: Gender | null;
  injury?: string;
  discounts: DiscountItem[];
  current: { id: string; name: string } | null; // 회원의 현재 할인 자격(비활성 프리셋이어도 선택 유지)
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({ name, phone, gender: (gender ?? "female") as Gender, injury: injury ?? "", birth: "", discountId: current?.id ?? "" });
  // 비활성 프리셋이 회원에 저장돼 있으면 목록에 없으므로 병합해 선택 유지.
  const discountExtra = current && !discounts.some((d) => d.id === current.id) ? [current] : [];

  function save() {
    startTransition(async () => {
      const r = await updateMember(id, { name: f.name, phone: f.phone, gender: f.gender, injuryNote: f.injury, birth: f.birth, discountId: f.discountId || null });
      if (r.ok) {
        setF((s) => ({ ...s, birth: "" })); // 저장 후 비움 — 다음 편집서 stale 값이 재차 비번초기화 트리거하지 않도록
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
      <button
        type="button"
        onClick={() => { setF((s) => ({ ...s, birth: "" })); setOpen(true); }}
        aria-label="회원 정보 수정"
        className="tappable flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-sage-deep/40 text-sage-deep hover:bg-sage/[0.07]"
      >
        <Icon name="pencil" size={16} />
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
              <Field icon="person" label="생년월일 변경 (선택)">
                <TextInput
                  value={f.birth}
                  onChange={(e) => setF({ ...f, birth: e.target.value })}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="변경할 때만 입력 (예: 900325)"
                />
              </Field>
              <p className="text-[11.5px] text-muted">생년월일을 바꾸면 로그인 비밀번호도 새 생년월일 6자리로 초기화돼요.</p>
              <Field icon="triangle-exclamation" label="부상 메모 (선택)">
                <TextInput
                  value={f.injury}
                  onChange={(e) => setF({ ...f, injury: e.target.value })}
                  placeholder="예: 오른쪽 무릎 주의"
                />
              </Field>
              {discounts.length > 0 || current ? (
                <div>
                  <div className="mb-2 text-[12.5px] font-semibold text-muted5">특별 할인 자격 (선택)</div>
                  <Select
                    value={f.discountId}
                    options={[
                      { value: "", label: "할인 없음" },
                      ...discounts.map((d) => ({ value: d.id, label: d.name })),
                      ...discountExtra.map((d) => ({ value: d.id, label: d.name })),
                    ]}
                    onChange={(v) => setF({ ...f, discountId: v })}
                  />
                </div>
              ) : null}
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
