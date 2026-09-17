"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar } from "@/components/ui/Avatar";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RadioOption } from "@/components/ui/RadioOption";
import { Kicker } from "@/components/ui/Kicker";
import { Spinner } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import {
  acceptRequest,
  counterPropose,
  loadTrainerProposeSlots,
  rejectRequest,
} from "@/lib/data/groups/scheduling-actions";
import type { TrainerInboxView } from "@/lib/data/groups/scheduling";

type Tab = "received" | "sent";
type PendingAction = { id: string; kind: "accept" | "reject"; type: "change" | "cancel" };
type Slot = { id: string; label: string; iso: string };

/** 변경 요청 카드 안에서 페이지 이동 없이 대안 시간을 역제안하는 인라인 패널. */
function CounterPropose({
  requestId,
  sessionId,
  onDone,
}: {
  requestId: string;
  sessionId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [submitting, startSubmit] = useTransition();

  async function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!slots && !loading) {
      setLoading(true);
      const v = await loadTrainerProposeSlots(sessionId);
      setLoading(false);
      if (!v) {
        toast("시간을 불러오지 못했어요", "error");
        setOpen(false);
        return;
      }
      setSlots(v.slots);
    }
  }

  function toggleSlot(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  const count = picked.size + (customDate && customTime ? 1 : 0);

  function submit() {
    const customIso =
      customDate && customTime
        ? new Date(`${customDate}T${customTime}:00+09:00`).toISOString()
        : null;
    if (customIso && customIso <= new Date().toISOString()) {
      toast("지난 시간은 제안할 수 없어요", "error");
      return;
    }
    const slotsIso = [
      ...(slots ?? []).filter((s) => picked.has(s.id)).map((s) => s.iso),
      ...(customIso ? [customIso] : []),
    ];
    if (slotsIso.length === 0) return;
    startSubmit(async () => {
      const r = await counterPropose(requestId, slotsIso);
      if (!r.ok) {
        toast(r.error ?? "제안을 보내지 못했어요", "error");
        return;
      }
      toast("다른 시간을 제안했어요");
      onDone();
    });
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={toggleOpen}
        className="tappable flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-sage-deep/35 bg-transparent py-2.5 text-[12.5px] font-bold text-sage-deep"
      >
        <Icon name="clock" size={15} />
        다른 시간 제안
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
      </button>

      {open ? (
        <div className="mt-2.5 rounded-[12px] border border-ink/[0.08] bg-sage-banner p-3">
          {loading || !slots ? (
            <div className="flex items-center justify-center py-4 text-muted">
              <Spinner size={20} />
            </div>
          ) : (
            <>
              <Kicker className="mb-2">새 시간 · 최대 3개</Kicker>
              <div className="flex flex-col gap-2">
                {slots.map((s) => (
                  <RadioOption
                    key={s.id}
                    shape="square"
                    selected={picked.has(s.id)}
                    onClick={() => toggleSlot(s.id)}
                  >
                    <span className="text-[13.5px] font-semibold text-ink">{s.label}</span>
                  </RadioOption>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-ink/[0.08] bg-card px-3.5 py-2.5">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] font-semibold text-ink"
                />
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  step={1800}
                  className="bg-transparent text-[13px] font-semibold text-ink"
                />
              </div>
              <button
                type="button"
                disabled={count === 0 || submitting}
                onClick={submit}
                className="tappable mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-sage py-2.5 text-[12.5px] font-bold text-surface disabled:opacity-50"
              >
                {submitting ? <Spinner size={15} /> : <Icon name="send" size={14} />}
                제안 보내기{count > 0 ? ` · ${count}개` : ""}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function InboxClient({ view }: { view: TrainerInboxView }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("received");
  const [pending, setPending] = useState<PendingAction | null>(null);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-2.5">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">일정 조율</span>
          {view.receivedCount > 0 ? (
            <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-terracotta px-1.5 text-[11px] font-bold text-surface">
              {view.receivedCount}
            </span>
          ) : null}
        </div>

        <SegmentedToggle<Tab>
          className="mb-4"
          value={tab}
          onChange={setTab}
          options={[
            { value: "received", label: `받은 요청 ${view.receivedCount}` },
            { value: "sent", label: `보낸 요청 ${view.sentCount}` },
          ]}
        />

        {tab === "received" ? (
          view.received.length === 0 ? (
            <EmptyState
              icon="circle-check"
              tone="green"
              title="받은 요청이 없어요"
              desc="회원이 보낸 변경·취소 요청이 여기에 표시돼요."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {view.received.map((item) => (
                <Card key={item.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar initial={item.initial} tone={item.avatarTone} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-ink">{item.name}</span>
                        <span className="text-[12px] text-muted">{item.ago}</span>
                      </div>
                    </div>
                    <Badge variant={item.type === "change" ? "changeReq" : "cancelReq"}>
                      {item.type === "change" ? "변경 요청" : "취소 요청"}
                    </Badge>
                  </div>

                  {item.type === "change" ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-[10px] bg-sage-banner px-3 py-2 text-[12.5px] font-semibold text-muted6 line-through">
                        {item.before}
                      </span>
                      <Icon name="chevron-right" size={15} className="flex-none text-chevron" />
                      <span className="rounded-[10px] bg-sage-banner2 px-3 py-2 text-[12.5px] font-bold text-sage-deep">
                        {item.after}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* 어느 수업의 취소인지 일시를 표기 — 대상 없이 수락/거절해야 하던 문제(감사 #24) */}
                      {item.before ? (
                        <div className="mt-3">
                          <span className="rounded-[10px] bg-sage-banner px-3 py-2 text-[12.5px] font-semibold text-muted6">
                            {item.before} 수업
                          </span>
                        </div>
                      ) : null}
                      {item.reason ? (
                        <Banner tone="warn" className="mt-3">
                          {item.reason}
                        </Banner>
                      ) : null}
                    </>
                  )}

                  <div className="mt-3.5 flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPending({ id: item.id, kind: "reject", type: item.type })}
                      className="tappable flex-1 rounded-[10px] border border-ink/10 bg-card py-2.5 text-[12.5px] font-bold text-ink"
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ id: item.id, kind: "accept", type: item.type })}
                      className="tappable flex-1 rounded-[10px] bg-sage py-2.5 text-[12.5px] font-bold text-surface"
                    >
                      수락
                    </button>
                  </div>

                  {/* 변경 요청만: 페이지 이동 없이 대안 시간 역제안 */}
                  {item.type === "change" ? (
                    <CounterPropose
                      requestId={item.id}
                      sessionId={item.sessionId}
                      onDone={() => router.refresh()}
                    />
                  ) : null}
                </Card>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            {view.sent.map((s) => (
              <Card key={s.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <Avatar initial={s.name.slice(0, 1)} tone="gold" size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-ink">{s.name}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{s.summary}</div>
                    {s.memberSeen ? (
                      <div className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-sage-deep">
                        <Icon name="circle-check" size={12} />
                        회원이 확인했어요
                      </div>
                    ) : null}
                  </div>
                  <Badge variant="awaiting">응답 대기</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="h-3.5" />
      </Body>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === "reject"
            ? "요청을 거절할까요?"
            : pending?.type === "cancel"
            ? "취소 요청을 수락할까요?"
            : "변경 요청을 수락할까요?"
        }
        description={
          pending?.kind === "reject"
            ? "거절 후 회원에게 알림이 전송돼요."
            : pending?.type === "cancel"
            ? "수업이 취소 처리돼요."
            : "일정이 변경 처리돼요."
        }
        confirmLabel={pending?.kind === "reject" ? "거절" : "수락"}
        tone={pending?.kind === "reject" ? "warn" : "default"}
        onConfirm={async () => {
          if (!pending) return;
          const { id, kind, type } = pending;
          setPending(null);
          // 서버 결과를 확인한다 — 원자 클레임으로 두 번째 처리가 거부됐는데도 성공으로 표시하던 버그(감사 H9).
          if (kind === "reject") {
            const r = await rejectRequest(id);
            toast(r.ok ? "요청을 거절했어요" : (r.error ?? "이미 처리된 요청이에요"), r.ok ? "success" : "error");
            router.refresh();
          } else {
            const r = await acceptRequest(id);
            if (!r.ok) {
              toast(r.error ?? "처리하지 못했어요", "error");
              router.refresh();
            } else if (type === "change") {
              router.push(`/confirm?request=${encodeURIComponent(id)}`);
            } else {
              toast("요청을 처리했어요");
              router.refresh();
            }
          }
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
