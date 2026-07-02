"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { setMemberStatus } from "@/lib/data/groups/owner-ops-actions";

type Status = "active" | "rest" | "inactive";
const OPTS: { v: Status; l: string }[] = [
  { v: "active", l: "활성" },
  { v: "rest", l: "휴면" },
  { v: "inactive", l: "탈퇴" },
];

/** 대표 전용 회원 상태 전환(활성/휴면/탈퇴). 탈퇴 시 1:1 정기수업이 자동 중지된다(감사 H5). */
export function MemberStatusControl({ memberId, status }: { memberId: string; status: Status }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function change(next: Status) {
    if (busy || next === status) return;
    if (next === "inactive" && typeof window !== "undefined" && !confirm("이 회원을 탈퇴 처리할까요? 정기 수업(1:1)이 자동으로 중지돼요.")) return;
    setBusy(true);
    const r = await setMemberStatus(memberId, next);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "상태 변경에 실패했어요");
    toast(next === "active" ? "활성으로 전환했어요" : next === "rest" ? "휴면으로 전환했어요" : "탈퇴 처리했어요");
    router.refresh();
  }

  return (
    <div className="mb-3.5 flex items-center gap-1.5 rounded-[13px] border border-ink/[0.08] bg-card px-2 py-2">
      {OPTS.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={busy}
          onClick={() => change(o.v)}
          className={`flex-1 rounded-[10px] py-2 text-[13px] font-bold transition disabled:opacity-50 ${
            status === o.v ? "bg-sage text-surface" : "text-muted2 hover:bg-ink/[0.04]"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
