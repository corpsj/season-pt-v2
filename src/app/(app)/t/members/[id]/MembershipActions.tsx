"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MiniButton, OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { Field, MoneyInput, PhoneInput } from "@/components/ui/Field";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  extendMembership,
  previewRefund,
  refundMembership,
  transferMembership,
  pauseMembership,
  resumeMembership,
} from "@/lib/data/groups/membership-actions";
import type { PaymentMethod } from "@/lib/types";

export function MembershipActions({
  membershipId,
  canExtend,
  paused = false,
  isTeam = false,
}: {
  membershipId: string;
  canExtend: boolean;
  paused?: boolean;
  isTeam?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [refundModal, setRefundModal] = useState<null | { base: number; used: number; noBaseline: boolean }>(null);
  const [amt, setAmt] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("account");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");

  async function onExtend() {
    if (busy) return;
    if (!(await confirm({ title: "유효기간을 연장할까요?", description: "상품 기간만큼 늘어나요.", confirmLabel: "연장" }))) return;
    setBusy(true);
    const r = await extendMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "유효기간을 연장했어요" : (r.error ?? "연장 실패"), r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }

  async function openRefund() {
    const p = await previewRefund(membershipId);
    if (!p.ok) {
      toast(p.error ?? "환불 정보를 불러오지 못했어요", "error");
      return;
    }
    // ponytail: cast — ok:true branch not a proper discriminant in inferred union
    const pp = p as { ok: true; refund: number; used: number; noBaseline?: boolean };
    // noBaseline(이관): 산식 항상 0원 → prefill하면 0원 원클릭 환불 가능(감사3 #7). 직접 입력 강제.
    setAmt(pp.noBaseline ? "" : String(pp.refund));
    setMethod("account");
    setRefundModal({ base: pp.refund, used: pp.used, noBaseline: !!pp.noBaseline });
  }

  async function doRefund() {
    const n = Number(amt);
    if (amt === "" || !Number.isInteger(n) || n < 0) {
      toast("환불 금액을 확인해주세요", "error");
      return;
    }
    setRefundModal(null);
    setBusy(true);
    const r = await refundMembership({ membershipId, method, amountOverride: n });
    setBusy(false);
    toast(r.ok ? `환불 처리했어요 (${r.refund!.toLocaleString()}원)` : (r.error ?? "환불 실패"), r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }

  async function onPause() {
    if (busy) return;
    // 2:1 팀은 함께 수업하므로, 한 명만 정지하면 팀 수업은 계속 생성되나 출석 확정이 막힌다.
    // 파트너 일정도 함께 조정하도록 정지 전에 알린다.
    if (isTeam && !(await confirm({ title: "2:1 팀 수업 중인 회원이에요", description: "정지하면 팀 수업 진행이 막혀요. 파트너 일정도 함께 조정해주세요.", confirmLabel: "정지" }))) return;
    setBusy(true);
    const r = await pauseMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "회원권을 일시정지했어요" : (r.error ?? "정지 실패"), r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }

  async function onResume() {
    if (busy) return;
    setBusy(true);
    const r = await resumeMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "회원권을 재개했어요 (정지기간만큼 연장)" : (r.error ?? "재개 실패"), r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }

  // 대표는 회원 UUID를 모르므로 휴대폰 번호로 양도 대상을 지정(서버에서 조회). 잔여 회차만 이전(일정 별도).
  async function doTransfer() {
    if (transferPhone.length < 10) {
      toast("휴대폰 번호를 확인해주세요", "error");
      return;
    }
    setTransferOpen(false);
    setBusy(true);
    const r = await transferMembership({ membershipId, toPhone: transferPhone });
    setBusy(false);
    toast(r.ok ? "양도했어요 (잔여 회차 이전 완료)" : (r.error ?? "양도 실패"), r.ok ? "success" : "error");
    if (r.ok) router.push("/t/members");
  }

  return (
    <>
      {paused ? (
        <MiniButton icon="play" onClick={onResume} disabled={busy}>
          재개
        </MiniButton>
      ) : (
        <>
          {canExtend && (
            <MiniButton icon="clock" onClick={onExtend} disabled={busy}>
              연장
            </MiniButton>
          )}
          <MiniButton icon="arrow-right" onClick={() => { setTransferPhone(""); setTransferOpen(true); }} disabled={busy}>
            양도
          </MiniButton>
          <MiniButton icon="coins" onClick={openRefund} disabled={busy}>
            환불
          </MiniButton>
          <MiniButton icon="pause" onClick={onPause} disabled={busy}>
            정지
          </MiniButton>
        </>
      )}
      {transferOpen && (
        <div
          onClick={() => setTransferOpen(false)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(38,35,30,0.42)] sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-[20px] bg-card p-5 pb-[max(20px,var(--safe-b))] sm:rounded-[20px]"
          >
            <div className="mb-3.5 text-[16px] font-bold text-ink">회원권을 양도할까요?</div>
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-muted5">
                잔여 회차만 이전돼요. 정기 일정은 양도 후 따로 설정해주세요.
              </p>
              <Field icon="phone" label="양도받을 회원의 휴대폰 번호">
                <PhoneInput value={transferPhone} onValueChange={setTransferPhone} placeholder="010-0000-0000" autoFocus />
              </Field>
            </div>
            <div className="mt-4 flex gap-2.5">
              <OutlineButton onClick={() => setTransferOpen(false)} className="flex-1">
                취소
              </OutlineButton>
              <PrimaryButton onClick={doTransfer} pending={busy} disabled={transferPhone.length < 10} className="flex-1">
                양도
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
      {refundModal && (
        <div
          onClick={() => setRefundModal(null)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(38,35,30,0.42)] sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-[20px] bg-card p-5 pb-[max(20px,var(--safe-b))] sm:rounded-[20px]"
          >
            <div className="mb-3.5 text-[16px] font-bold text-ink">환불을 진행할까요?</div>
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-muted5">
                산식 기준 {refundModal.base.toLocaleString()}원 (사용 {refundModal.used}회)
                {refundModal.noBaseline ? " · 이관 회원권 — 금액을 직접 입력하세요" : ""}
              </p>
              <Field icon="coins" label="환불 금액" hint="원">
                <MoneyInput value={amt} onValueChange={setAmt} placeholder="환불 금액" />
              </Field>
              <div>
                <div className="mb-2 text-[12.5px] font-semibold text-muted5">환불 수단</div>
                <SegmentedToggle
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: "card", label: "카드" },
                    { value: "cash", label: "현금" },
                    { value: "account", label: "계좌" },
                  ]}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2.5">
              <OutlineButton onClick={() => setRefundModal(null)} className="flex-1">
                취소
              </OutlineButton>
              <PrimaryButton onClick={doRefund} pending={busy} disabled={amt === ""} className="flex-1">
                환불
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
