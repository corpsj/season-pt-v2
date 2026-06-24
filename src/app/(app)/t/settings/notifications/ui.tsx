"use client";
import { useState } from "react";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { Switch } from "@/components/ui/Switch";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { updateNotifications } from "@/lib/data/groups/owner-ops-actions";
import type { StudioSettings } from "@/lib/types";

type Row = { key: keyof Pick<StudioSettings, "notifExpiry" | "notifSession" | "notifPayment">; label: string; sub: string };

const ROWS: Row[] = [
  { key: "notifExpiry", label: "만료 임박 알림", sub: "회원권 잔여 3회 또는 7일 이하" },
  { key: "notifSession", label: "수업 리마인더", sub: "수업 24시간 전 자동 발송" },
  { key: "notifPayment", label: "결제 알림", sub: "결제 완료 시 회원에게 발송" },
];

export function NotificationsClient({ settings }: { settings: StudioSettings }) {
  const toast = useToast();
  const [state, setState] = useState({
    notifExpiry: settings.notifExpiry,
    notifSession: settings.notifSession,
    notifPayment: settings.notifPayment,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await updateNotifications(state);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "저장에 실패했어요");
    toast("알림 설정을 저장했어요");
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/settings" />
          <span className="text-[19px] font-bold text-ink">알림 설정</span>
        </div>

        <Banner tone="neutral" className="mb-5">
          실제 발송 연동은 추후 제공될 예정이에요. 지금은 설정만 저장됩니다.
        </Banner>

        <div className="mb-2.5">
          <Kicker>알림 항목</Kicker>
        </div>
        <Card className="overflow-hidden">
          {ROWS.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-center gap-3 px-4 py-[14px] ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
            >
              <div className="flex-1">
                <div className="text-[14px] font-bold text-ink">{row.label}</div>
                <div className="mt-0.5 text-[12px] font-medium text-muted">{row.sub}</div>
              </div>
              <Switch
                on={state[row.key]}
                onChange={(next) => setState((s) => ({ ...s, [row.key]: next }))}
                label={row.label}
              />
            </div>
          ))}
        </Card>
      </Body>

      <Footer>
        <PrimaryButton icon="check-bold" onClick={save} disabled={busy}>
          저장하기
        </PrimaryButton>
      </Footer>
    </div>
  );
}
