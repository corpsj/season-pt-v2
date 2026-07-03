"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/icon";
import { deleteMember } from "@/lib/data/groups/owner-ops-actions";

/** 대표 전용 회원 완전 삭제. 되돌릴 수 없어 '탈퇴'와 별도로 눈에 덜 띄게 둔다. */
export function DeleteMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    const r = await deleteMember(memberId);
    setBusy(false);
    setOpen(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    toast("회원을 삭제했어요");
    router.push("/t/members");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="tappable mb-3.5 flex w-full items-center gap-3 rounded-[13px] bg-warm-banner px-4 py-[14px] text-left disabled:opacity-60"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-card text-terracotta">
          <Icon name="circle-close" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-terracotta-deep">회원 완전 삭제</span>
          <span className="mt-0.5 block text-[12px] font-medium text-terracotta/80">회원권·결제·기록이 함께 삭제돼요 (되돌릴 수 없음)</span>
        </span>
        <Icon name="chevron-right" size={15} className="flex-none text-terracotta" />
      </button>
      <ConfirmDialog
        open={open}
        title={`${name} 회원을 삭제할까요?`}
        description="회원권·결제·출석·기록·사진·식단이 모두 영구 삭제돼요. 되돌릴 수 없어요. 기록을 남기려면 '탈퇴'를 사용하세요."
        confirmLabel="완전 삭제"
        tone="warn"
        onConfirm={remove}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
