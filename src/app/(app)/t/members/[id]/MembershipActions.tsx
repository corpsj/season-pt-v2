"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  extendMembership,
  previewRefund,
  refundMembership,
  transferMembership,
  pauseMembership,
  resumeMembership,
} from "@/lib/data/groups/membership-actions";

export function MembershipActions({
  membershipId,
  canExtend,
  paused = false,
}: {
  membershipId: string;
  canExtend: boolean;
  paused?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundDesc, setRefundDesc] = useState("");

  async function onExtend() {
    if (busy) return;
    setBusy(true);
    const r = await extendMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "유효기간을 연장했어요" : (r.error ?? "연장 실패"));
    if (r.ok) router.refresh();
  }

  async function openRefund() {
    const p = await previewRefund(membershipId);
    if (!p.ok) {
      toast(p.error ?? "환불 정보를 불러오지 못했어요");
      return;
    }
    // ponytail: cast — ok:true branch not a proper discriminant in inferred union
    const pp = p as { ok: true; refund: number; used: number; deduction: number; penalty: number };
    setRefundDesc(
      `환불 ${pp.refund.toLocaleString()}원 (사용 ${pp.used}회 정상가 차감 ${pp.deduction.toLocaleString()} · 위약금 ${pp.penalty.toLocaleString()})`,
    );
    setRefundOpen(true);
  }

  async function doRefund() {
    setRefundOpen(false);
    setBusy(true);
    const r = await refundMembership({ membershipId, method: "account" });
    setBusy(false);
    toast(r.ok ? `환불 처리했어요 (${r.refund!.toLocaleString()}원)` : (r.error ?? "환불 실패"));
    if (r.ok) router.refresh();
  }

  async function onPause() {
    if (busy) return;
    setBusy(true);
    const r = await pauseMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "회원권을 일시정지했어요" : (r.error ?? "정지 실패"));
    if (r.ok) router.refresh();
  }

  async function onResume() {
    if (busy) return;
    setBusy(true);
    const r = await resumeMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "회원권을 재개했어요 (정지기간만큼 연장)" : (r.error ?? "재개 실패"));
    if (r.ok) router.refresh();
  }

  async function onTransfer() {
    // 대표는 회원 UUID를 모르므로 휴대폰 번호로 양도 대상을 지정(서버에서 조회). 잔여 회차만 이전(일정 별도).
    const toPhone = prompt("양도받을 회원의 휴대폰 번호를 입력하세요 (잔여 회차만 이전됩니다)")?.trim();
    if (!toPhone) return;
    setBusy(true);
    const r = await transferMembership({ membershipId, toPhone });
    setBusy(false);
    toast(r.ok ? "양도했어요 (잔여 회차 이전 완료)" : (r.error ?? "양도 실패"));
    if (r.ok) router.push("/t/members");
  }

  return (
    <>
      {paused ? (
        <PrimaryButton icon="clock" onClick={onResume} disabled={busy} className="w-full">
          정지 해제 (재개)
        </PrimaryButton>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-2.5">
            {canExtend && (
              <OutlineButton icon="clock" onClick={onExtend} disabled={busy}>
                연장
              </OutlineButton>
            )}
            <OutlineButton icon="arrow-right" onClick={onTransfer} disabled={busy}>
              양도
            </OutlineButton>
            <PrimaryButton icon="coins" onClick={openRefund} disabled={busy}>
              환불
            </PrimaryButton>
          </div>
          <OutlineButton icon="clock" onClick={onPause} disabled={busy}>
            일시정지 (부상·출장 등)
          </OutlineButton>
        </div>
      )}
      <ConfirmDialog
        open={refundOpen}
        title="환불을 진행할까요?"
        description={refundDesc}
        confirmLabel="환불"
        onConfirm={doRefund}
        onCancel={() => setRefundOpen(false)}
      />
    </>
  );
}
