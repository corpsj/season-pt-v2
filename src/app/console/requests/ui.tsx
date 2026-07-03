"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, pill } from "@/components/console/ui";
import { acceptRequest, rejectRequest } from "@/lib/data/groups/scheduling-actions";
import type { StudioInboxItem, StudioInboxDone } from "@/lib/data/groups/console";

function KindChip({ type }: { type: "change" | "cancel" }) {
  return type === "change" ? (
    <span className="inline-flex items-center gap-1 rounded-[7px] bg-[#E7EDF2] px-2.5 py-[3px] text-[10.5px] font-bold text-[#48586A]"><Icon name="refresh" size={12} />일정 변경</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-[7px] bg-[#FBF3E9] px-2.5 py-[3px] text-[10.5px] font-bold text-[#C67352]"><Icon name="close" size={12} />수업 취소</span>
  );
}

export function RequestsClient({ pending, done }: { pending: StudioInboxItem[]; done: StudioInboxDone[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, kind: "accept" | "reject") {
    setBusy(id);
    const r = kind === "accept" ? await acceptRequest(id) : await rejectRequest(id);
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "처리에 실패했어요", "error");
    toast(kind === "accept" ? "승인했어요" : "거절했어요");
    router.refresh();
  }

  return (
    <>
      {pending.length === 0 ? (
        <Card className="px-5 py-14 text-center">
          <div className="mx-auto mb-3.5 flex h-[54px] w-[54px] items-center justify-center rounded-[16px] bg-[#EDF4E3]"><Icon name="circle-check-fill" size={26} className="text-green-active" /></div>
          <div className="text-[15px] font-bold text-ink">처리할 요청이 없어요</div>
          <div className="mt-1.5 text-[12.5px] font-medium text-[#9A917F]">새 요청이 오면 여기에 표시돼요</div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((r) => (
            <Card key={r.id} className="px-5 py-[18px]">
              <div className="mb-3.5 flex items-center gap-3">
                <Avatar initial={r.initial} tone={r.avatarTone} size={46} fontSize={16} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15.5px] font-bold text-ink">{r.name}</span>
                    <KindChip type={r.type} />
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-medium text-[#9A917F]">담당 {r.trainerName} · {r.ago}</div>
                </div>
              </div>
              <div className="mb-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3">
                {r.type === "change" ? (
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className="text-[12.5px] font-semibold text-[#9A917F] line-through">{r.before}</span>
                    <Icon name="chevron-right" size={15} className="text-sage-deep" />
                    <span className="text-[13px] font-bold text-ink">{r.after}</span>
                  </div>
                ) : (
                  <div className="mb-2 flex items-center gap-2"><Icon name="close" size={14} className="text-terracotta" /><span className="text-[13px] font-bold text-ink">{r.before} 취소</span></div>
                )}
                {r.reason ? <div className="text-[12px] font-medium text-[#847A66]">&ldquo;{r.reason}&rdquo;</div> : null}
              </div>
              <div className="flex gap-2.5">
                <OBtn className="flex-1" disabled={busy === r.id} onClick={() => act(r.id, "reject")}>거절</OBtn>
                <PBtn icon="check-bold" className="flex-[1.6]" pending={busy === r.id} onClick={() => act(r.id, "accept")}>승인</PBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 ? (
        <>
          <div className="mb-[11px] mt-[22px] text-[11px] font-semibold tracking-[0.04em] text-[#A89F92]">처리한 요청 {done.length}건</div>
          <div className="flex flex-col gap-2.5">
            {done.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-[14px] border border-[rgba(75,59,46,0.06)] bg-white px-4 py-3">
                <Avatar initial={r.initial} tone={r.avatarTone} size={36} />
                <div className="min-w-0 flex-1"><span className="text-[13.5px] font-semibold text-ink">{r.name}</span><span className="text-[12px] font-medium text-[#9A917F]"> · {r.type === "change" ? "일정 변경" : "수업 취소"}</span></div>
                <span style={r.status === "accepted" ? pill("#5C9166", "#EDF4E3") : pill("#8C8475", "#EFEAE1")}>{r.status === "accepted" ? "승인됨" : "거절됨"}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
