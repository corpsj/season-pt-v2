"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { addMealFeedback } from "@/lib/data/groups/meals-actions";
import type { MealLog } from "@/lib/data/groups/meals";

const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function MemberMealsSection({ initial }: { initial: MealLog[] }) {
  const router = useRouter();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = initial.filter((m) => !m.feedback).length;

  function openFeedback(m: MealLog) {
    setOpenId(m.id);
    setDraft(m.feedback ?? "");
  }
  async function save(id: string) {
    if (busy || !draft.trim()) return;
    setBusy(true);
    try {
      const r = await addMealFeedback(id, draft);
      if (!r.ok) return toast(r.error ?? "저장에 실패했어요", "error");
      toast("피드백을 남겼어요");
      setOpenId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3.5 px-4 py-[14px]">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-muted5">식단</span>
        {pending > 0 ? <span className="rounded-md bg-[#FBF3E9] px-1.5 py-0.5 text-[11px] font-bold text-terracotta">피드백 {pending}</span> : null}
        <span className="ml-auto text-[12px] font-medium text-muted">{initial.length}개</span>
      </div>

      {initial.length === 0 ? (
        <div className="py-4 text-center text-[12.5px] font-medium text-muted">아직 식단 기록이 없어요</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {initial.map((m) => (
            <div key={m.id} className="rounded-[13px] bg-[#FBF7F1] p-3">
              <div className="flex gap-3">
                {m.photoUrl ? (
                  <a href={m.photoUrl} target="_blank" rel="noreferrer" className="h-[58px] w-[58px] flex-none overflow-hidden rounded-[11px] bg-ink/[0.04]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photoUrl} alt="식단" className="h-full w-full object-cover" />
                  </a>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    {m.mealType ? <span className="text-[12px] font-bold text-sage-deep">{m.mealType}</span> : null}
                    <span className="text-[11.5px] font-medium text-muted">{kst(m.eatenAt)}</span>
                  </div>
                  {m.memo ? <div className="text-[13px] leading-snug text-ink">{m.memo}</div> : null}
                </div>
              </div>

              {m.feedback && openId !== m.id ? (
                <div className="mt-2.5 flex items-start gap-2 rounded-[11px] bg-[#EDF4E3] px-3 py-2">
                  <Icon name="message-fill" size={13} className="mt-0.5 flex-none text-sage-deep" />
                  <span className="flex-1 text-[12.5px] leading-relaxed text-[#4F5A45]">{m.feedback}</span>
                  <button onClick={() => openFeedback(m)} className="flex-none text-[11.5px] font-semibold text-sage-deep">수정</button>
                </div>
              ) : openId === m.id ? (
                <div className="mt-2.5">
                  <PlainTextInput
                    multiline
                    value={draft}
                    onChange={setDraft}
                    placeholder="식단 피드백을 남겨주세요"
                    className="min-h-[44px] w-full resize-none rounded-[11px] border border-ink/[0.12] bg-white px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <button onClick={() => setOpenId(null)} disabled={busy} className="flex-1 rounded-[10px] border border-ink/[0.12] bg-white py-2 text-[12.5px] font-semibold text-muted disabled:opacity-50">취소</button>
                    <button onClick={() => save(m.id)} disabled={busy || !draft.trim()} className="flex-[1.6] rounded-[10px] bg-sage py-2 text-[12.5px] font-semibold text-surface disabled:opacity-50">저장</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openFeedback(m)} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-dashed border-sage/40 py-2 text-[12.5px] font-semibold text-sage-deep">
                  <Icon name="message" size={13} />피드백 남기기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
