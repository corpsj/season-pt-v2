"use client";
import { useState } from "react";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Field, TextInput } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { updatePolicy } from "@/lib/data/groups/owner-ops-actions";
import type { StudioSettings } from "@/lib/types";

export function PolicyClient({ settings }: { settings: StudioSettings }) {
  const toast = useToast();
  const [noshowDeducts, setNoshowDeducts] = useState(settings.noshowDeducts);
  const [cutoffHours, setCutoffHours] = useState(String(settings.cancelCutoffHours));
  const [busy, setBusy] = useState(false);

  const cutoffNum = Math.max(0, Number(cutoffHours.replace(/[^\d]/g, "")) || 0);
  const helperText =
    cutoffNum === 0
      ? "0 = 항상 차감 없음"
      : `수업 ${cutoffNum}시간 전까지 취소는 차감 없음`;

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await updatePolicy({ noshowDeducts, cancelCutoffHours: cutoffNum });
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "저장에 실패했어요");
    toast("정책을 저장했어요");
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/settings" />
          <span className="text-[19px] font-bold text-ink">노쇼·취소 정책</span>
        </div>

        <div className="mb-2.5">
          <Kicker>노쇼</Kicker>
        </div>
        <Card className="mb-5 flex items-center gap-3 px-4 py-[15px]">
          <div className="flex-1">
            <div className="text-[14px] font-bold text-ink">노쇼 차감</div>
            <div className="mt-0.5 text-[12px] font-medium text-muted">
              노쇼 처리 시 회원권 1회 차감
            </div>
          </div>
          <Switch on={noshowDeducts} onChange={setNoshowDeducts} label="노쇼 차감" />
        </Card>

        <div className="mb-2.5">
          <Kicker>취소</Kicker>
        </div>
        <Card className="mb-1.5 px-4 py-[15px]">
          <Field icon="clock" label="취소 차감 기준 시간">
            <TextInput
              inputMode="numeric"
              placeholder="0"
              value={cutoffHours}
              onChange={(e) => setCutoffHours(e.target.value)}
            />
          </Field>
        </Card>
        <p className="mb-5 px-1 text-[12px] font-medium text-muted">{helperText}</p>
      </Body>

      <Footer>
        <PrimaryButton icon="check-bold" onClick={save} disabled={busy}>
          저장하기
        </PrimaryButton>
      </Footer>
    </div>
  );
}
