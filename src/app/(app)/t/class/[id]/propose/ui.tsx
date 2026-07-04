"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Kicker } from "@/components/ui/Kicker";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Chip } from "@/components/ui/Chip";
import { RadioOption } from "@/components/ui/RadioOption";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { sendPropose } from "@/lib/data/groups/scheduling-actions";

type ProposeView = {
  before: string;
  memberName: string;
  slots: { id: string; label: string; iso: string }[];
  reasons: string[];
};

export default function ProposeClient({
  sessionId,
  view,
}: {
  sessionId: string;
  view: ProposeView;
}) {
  const router = useRouter();
  const toast = useToast();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [reasonText, setReasonText] = useState("");

  function toggleSlot(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  const count = picked.size + (customDate && customTime ? 1 : 0);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-2.5">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">일정 변경 요청</span>
        </div>

        {/* before */}
        <div className="flex items-center gap-2 rounded-[13px] border border-ink/[0.08] bg-card px-4 py-3.5">
          <span className="text-[13px] font-semibold text-muted6 line-through">{view.before}</span>
          <span className="text-[13px] font-bold text-ink">{view.memberName}</span>
          <Icon name="chevron-down" size={16} className="ml-auto text-chevron" />
        </div>

        <div className="mb-2.5 mt-5">
          <Kicker>새 시간 제안 · 최대 3개</Kicker>
        </div>

        <div className="flex flex-col gap-2.5">
          {view.slots.map((s) => (
            <RadioOption
              key={s.id}
              shape="square"
              selected={picked.has(s.id)}
              onClick={() => toggleSlot(s.id)}
            >
              <span className="text-[14px] font-semibold text-ink">{s.label}</span>
            </RadioOption>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-2 rounded-[13px] border border-ink/[0.08] bg-card px-4 py-3">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 bg-transparent text-[14px] font-semibold text-ink"
          />
          <input
            type="time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            step={1800}
            className="bg-transparent text-[14px] font-semibold text-ink"
          />
        </div>

        <div className="mb-2.5 mt-5">
          <Kicker>사유 (선택)</Kicker>
        </div>

        <div className="flex flex-wrap gap-2">
          {view.reasons.map((r) => (
            <Chip
              key={r}
              selected={reason === r}
              onClick={() => setReason((prev) => (prev === r ? null : r))}
            >
              {r}
            </Chip>
          ))}
        </div>
        {reason === "직접 입력" ? (
          <PlainTextInput
            value={reasonText}
            onChange={setReasonText}
            placeholder="사유를 입력해주세요"
            className="mt-2.5 w-full rounded-[12px] border border-ink/[0.08] bg-card px-3.5 py-2.5 text-[13.5px]"
          />
        ) : null}
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton
          icon="send"
          disabled={count === 0}
          onClick={async () => {
            const customIso =
              customDate && customTime
                ? new Date(`${customDate}T${customTime}:00+09:00`).toISOString()
                : null;
            if (customIso && customIso <= new Date().toISOString()) {
              toast("지난 시간은 제안할 수 없어요", "error");
              return;
            }
            const slotsIso = [
              ...view.slots.filter((s) => picked.has(s.id)).map((s) => s.iso),
              ...(customIso ? [customIso] : []),
            ];
            if (slotsIso.length === 0) return;
            const r = await sendPropose(
              sessionId,
              slotsIso,
              reason === "직접 입력" ? reasonText.trim() || undefined : reason ?? undefined,
            );
            if (!r.ok) {
              toast(r.error ?? "요청 전송에 실패했어요", "error");
              return;
            }
            toast("변경 요청을 보냈어요");
            router.push("/t");
          }}
        >
          변경 요청 보내기 · {count}개 제안
        </PrimaryButton>
      </Footer>
    </div>
  );
}
