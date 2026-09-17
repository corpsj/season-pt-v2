"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kicker } from "@/components/ui/Kicker";
import { RadioOption } from "@/components/ui/RadioOption";
import { PrimaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { MemberReceiveItem } from "@/lib/data/groups/member";
import { acceptMemberChange, rejectMemberChange } from "@/lib/data/groups/member-actions";

export function MemberReceiveClient({ items: initialItems }: { items: MemberReceiveItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  function header(title: string) {
    return (
      <div className="mb-5 flex items-center gap-3">
        <BackButton fallback="/m" />
        <span className="text-[19px] font-bold text-ink">{title}</span>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="scr flex min-h-0 flex-1 flex-col">
        <Body>
          {header("일정 요청")}
          <EmptyState
            icon="circle-check"
            tone="green"
            title="처리할 요청이 없어요"
            desc="선생님이 보낸 일정 요청이 없어요."
          />
        </Body>
      </div>
    );
  }

  async function onAccept(item: MemberReceiveItem, slotIso: string | undefined) {
    if (busyId) return;
    const isCancel = item.type === "cancel";
    setBusyId(item.requestId);
    const res = await acceptMemberChange(item.requestId, isCancel ? undefined : slotIso);
    if (!res.ok) {
      setBusyId(null);
      toast(res.error ?? (isCancel ? "처리하지 못했어요" : "변경하지 못했어요"), "error");
      router.refresh(); // 이미 처리·만료된 요청이면 목록을 최신 상태로(죽은 버튼 방지)
      return;
    }
    const remaining = items.length - 1;
    if (isCancel) {
      toast("수업 취소를 확인했어요");
      if (remaining > 0) {
        setItems((prev) => prev.filter((i) => i.requestId !== item.requestId));
        setBusyId(null);
      } else {
        router.push("/m");
      }
    } else {
      // 변경 수락은 확정 화면을 거친다(기존 단건 UX 유지). 남은 요청이 있으면 목록으로 복귀.
      const to = remaining > 0 ? "/m/receive" : "/m";
      router.push(`/confirm?request=${encodeURIComponent(item.requestId)}&to=${encodeURIComponent(to)}`);
    }
  }

  async function onReject(item: MemberReceiveItem) {
    if (busyId) return;
    setBusyId(item.requestId);
    const res = await rejectMemberChange(item.requestId);
    if (!res.ok) {
      setBusyId(null);
      toast(res.error ?? "처리하지 못했어요", "error");
      router.refresh();
      return;
    }
    toast("요청을 거절했어요");
    const remaining = items.length - 1;
    if (remaining > 0) {
      setItems((prev) => prev.filter((i) => i.requestId !== item.requestId));
      setBusyId(null);
    } else {
      router.push("/m");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {header("일정 요청")}
        <div className="mb-3 px-0.5 text-[13px] font-semibold text-muted5">받은 요청 {items.length}건</div>
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <ReceiveCard
              key={item.requestId}
              item={item}
              busy={busyId === item.requestId}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))}
        </div>
        <div className="h-3.5" />
      </Body>
    </div>
  );
}

function ReceiveCard({
  item,
  busy,
  onAccept,
  onReject,
}: {
  item: MemberReceiveItem;
  busy: boolean;
  onAccept: (item: MemberReceiveItem, slotIso: string | undefined) => void;
  onReject: (item: MemberReceiveItem) => void;
}) {
  const isCancel = item.type === "cancel";
  const [selected, setSelected] = useState(item.slots[0]?.id ?? "");
  const chosenIso = item.slots.find((s) => s.id === selected)?.iso;

  return (
    <Card className="p-[15px]">
      {/* trainer row */}
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar initial={item.trainerName.charAt(0) || "선"} tone="sage" size={32} />
        <span className="text-[13.5px] font-bold text-ink">{item.trainerName} 선생님</span>
        <span className="text-[11.5px] font-medium text-muted">{item.ago}</span>
        <Badge variant={isCancel ? "cancelReq" : "changeReq"} className="ml-auto">
          {isCancel ? "취소 요청" : "변경 요청"}
        </Badge>
      </div>

      {/* target session */}
      <div className="mb-3 rounded-[12px] bg-chip-soft px-3.5 py-2.5">
        <div className="text-[11.5px] font-semibold text-muted5">{isCancel ? "취소할 수업" : "변경 전"}</div>
        <div className={`mt-0.5 text-[13.5px] font-medium ${isCancel ? "text-ink" : "text-muted6 line-through"}`}>
          {item.before}
        </div>
        {item.reason ? (
          <div className="mt-1.5 text-[12px] font-medium leading-[1.5] text-muted2">{item.reason}</div>
        ) : null}
      </div>

      {isCancel ? (
        <p className="mb-3.5 text-[12.5px] leading-[1.6] text-muted2">
          수락하면 수업이 취소되고 회차는 차감되지 않아요.
        </p>
      ) : (
        <>
          <div className="mb-2">
            <Kicker>제안된 시간 · 하나를 선택</Kicker>
          </div>
          <div className="mb-3.5 flex flex-col gap-2">
            {item.slots.map((s) => (
              <RadioOption key={s.id} selected={selected === s.id} onClick={() => setSelected(s.id)}>
                <span className="text-[13.5px] font-bold text-ink">{s.label}</span>
              </RadioOption>
            ))}
          </div>
        </>
      )}

      <PrimaryButton onClick={() => onAccept(item, chosenIso)} pending={busy}>
        {isCancel ? "수업 취소 수락" : "이 시간으로 변경"}
      </PrimaryButton>
      <div className="mt-2 flex items-center justify-center gap-4">
        {isCancel ? null : (
          <Link
            href={item.sessionId ? `/m/request?s=${item.sessionId}` : "/m/request"}
            className="tappable text-[13px] font-semibold text-sage-deep"
          >
            다른 시간 제안
          </Link>
        )}
        <button
          type="button"
          onClick={() => onReject(item)}
          disabled={busy}
          className="tappable text-[13px] font-semibold text-terracotta-link disabled:opacity-50"
        >
          거절하기
        </button>
      </div>
    </Card>
  );
}
