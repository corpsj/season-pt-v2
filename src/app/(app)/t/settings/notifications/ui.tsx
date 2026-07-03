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

type Row = { key: keyof Pick<StudioSettings, "notifExpiry" | "notifSession" | "notifPayment">; label: string; sub: string; ready: boolean };

// 라벨은 실제 발송 로직(notifications.ts)과 일치해야 한다. 예전 라벨은 토글이 통제하는 실제 알림과 어긋나
// '수업 리마인더'를 끄면 잔여 임박 알림이 통째로 멈추던 문제(감사 H13).
const ROWS: Row[] = [
  { key: "notifSession", label: "잔여 회차 임박 알림", sub: "남은 수업이 3회 이하일 때 회원·선생님에게", ready: true },
  { key: "notifExpiry", label: "만료 임박 알림", sub: "회원권 만료 7일 이하일 때 회원·선생님에게", ready: true },
  { key: "notifPayment", label: "결제 완료 알림", sub: "준비 중 — 아직 발송되지 않아요", ready: false },
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
          켜진 알림은 회원 앱·강사 앱에 인앱 알림으로 표시돼요. (휴대폰 푸시 알림은 준비 중)
        </Banner>

        <div className="mb-2.5">
          <Kicker>알림 항목</Kicker>
        </div>
        <Card className="shrink-0 overflow-hidden">
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
                on={row.ready && state[row.key]}
                disabled={!row.ready}
                onChange={(next) => row.ready && setState((s) => ({ ...s, [row.key]: next }))}
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
