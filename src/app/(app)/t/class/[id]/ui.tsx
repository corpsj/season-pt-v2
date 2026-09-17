"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { exerciseLine } from "@/lib/data/workout-format";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Kicker } from "@/components/ui/Kicker";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { PrimaryButton } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { sendCancelRequest } from "@/lib/data/groups/scheduling-actions";
import { addMealFeedback } from "@/lib/data/groups/meals-actions";
import { MemberFilesSection } from "../../members/[id]/MemberFilesSection";
import type { BadgeVariant, ClassDetailView, SessionMealItem } from "@/lib/types";

const STATUS: Record<string, { variant: BadgeVariant; label: string }> = {
  scheduled: { variant: "scheduled", label: "예정" },
  attended: { variant: "done", label: "완료" },
  noshow: { variant: "cancelled", label: "노쇼" },
  cancelled: { variant: "cancelled", label: "취소" },
};

export default function ClassDetailClient({ id, view }: { id: string; view: ClassDetailView }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState(view.members[0]?.memberId ?? "");

  const current = view.members.find((m) => m.memberId === selected) ?? view.members[0];
  const status = STATUS[view.status] ?? STATUS.scheduled;

  function requestCancel() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const r = await sendCancelRequest(view.sessionId);
      setConfirming(false);
      if (r.ok) {
        toast("취소 요청을 보냈어요");
        router.push("/t/inbox");
        router.refresh();
      } else {
        toast(r.error ?? "취소 요청에 실패했어요", "error");
      }
    });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-2.5">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">수업 상세</span>
        </div>

        {/* member card */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            {view.isTeam && view.team ? (
              <TeamAvatar team={view.team} size={42} />
            ) : (
              <Avatar initial={view.initial} tone={view.avatarTone} size={42} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-ink">{view.name}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted">{view.typeLabel}</div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-2 rounded-[13px] bg-sage-banner2 px-3.5 py-3">
            <Icon name="calendar" size={17} className="text-sage-deep" />
            <span className="text-[13px] font-semibold text-sage-deep">{view.dateLabel}</span>
          </div>
        </Card>

        {/* 2:1 target member picker */}
        {view.isTeam && view.members.length >= 2 ? (
          <SegmentedToggle
            className="mt-3.5"
            value={selected}
            onChange={setSelected}
            options={view.members.map((m) => ({ value: m.memberId, label: m.name }))}
          />
        ) : null}

        {current ? (
          <>
            {/* 운동 기록 */}
            <div className="mb-2.5 mt-5">
              <Kicker>운동 기록</Kicker>
            </div>
            <Card className="p-4">
              {current.record ? (
                <>
                  <div className="flex flex-col gap-2">
                    {current.record.exercises.map((e, i) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                          {e.name}
                        </span>
                        <span className="whitespace-nowrap text-[12.5px] font-medium text-muted">
                          {exerciseLine(e)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {current.record.comment ? (
                    <div className="mt-3 rounded-[10px] bg-chip-soft px-3 py-2.5 text-[12.5px] font-medium leading-[1.55] text-muted2">
                      {current.record.comment}
                    </div>
                  ) : null}
                  <Link
                    href={`/t/record/${id}`}
                    className="tappable mt-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-sage-deep"
                  >
                    <Icon name="pencil" size={14} />
                    수정하기
                  </Link>
                </>
              ) : (
                <>
                  <div className="py-1.5 text-center text-[13px] font-medium text-muted">
                    아직 운동 기록이 없어요
                  </div>
                  <Link
                    href={`/t/record/${id}`}
                    className="tappable mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed border-sage-deep/40 py-3 text-[13.5px] font-bold text-sage-deep"
                  >
                    <Icon name="plus-bold" size={16} />
                    기록 남기기
                  </Link>
                </>
              )}
            </Card>

            {/* 체형 기록 */}
            <div className="mb-2.5 mt-5">
              <Kicker>체형 기록</Kicker>
            </div>
            <MemberFilesSection
              kind="photo"
              memberId={current.memberId}
              takenAt={view.dateISO}
              initial={current.files
                .filter((f) => f.kind === "photo")
                .map((f) => ({ id: f.id, kind: "photo", url: f.url || null, note: f.note ?? null, takenAt: view.dateISO }))}
            />
            <MemberFilesSection
              kind="inbody"
              memberId={current.memberId}
              takenAt={view.dateISO}
              initial={current.files
                .filter((f) => f.kind === "inbody")
                .map((f) => ({ id: f.id, kind: "inbody", url: f.url || null, note: f.note ?? null, takenAt: view.dateISO }))}
            />

            {/* 식단 */}
            <div className="mb-2.5 mt-5">
              <Kicker>식단</Kicker>
            </div>
            {current.meals.length === 0 ? (
              <Card className="py-4 text-center text-[12.5px] font-medium text-muted">
                이 날 식단 기록이 없어요
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {current.meals.map((m) => (
                  <MealCard key={m.id} meal={m} />
                ))}
              </div>
            )}
          </>
        ) : null}

        {/* 일정 조율 — 강등 */}
        {view.status === "scheduled" ? (
          <>
            <div className="mb-2.5 mt-5">
              <Kicker>일정 조율</Kicker>
            </div>
            <Card className="overflow-hidden">
              <Link
                href={`/t/class/${id}/propose`}
                className="tappable flex w-full items-center gap-3 px-4 py-[15px] text-left"
              >
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-sage-banner2">
                  <Icon name="clock" size={18} className="text-sage-deep" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">일정 변경 요청</span>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    회원에게 다른 시간을 제안해요
                  </span>
                </span>
                <Icon name="chevron-right" size={16} className="text-chevron" />
              </Link>

              <div className="mx-4 border-t border-ink/[0.07]" />

              <button
                type="button"
                onClick={requestCancel}
                disabled={pending}
                className="tappable flex w-full items-center gap-3 px-4 py-[15px] text-left disabled:opacity-60"
              >
                <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-warm-banner">
                  <Icon name="close" size={18} className="text-terracotta" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">
                    {confirming ? "한 번 더 눌러 취소 요청" : "수업 취소 요청"}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {confirming ? "회원에게 취소 요청이 전송돼요" : "이번 수업 취소를 요청해요"}
                  </span>
                </span>
                <Icon name="chevron-right" size={16} className="text-chevron" />
              </button>
            </Card>

            <Banner tone="neutral" className="mt-3.5">
              변경·취소 요청은 수업 시작 전에 미리 보내주세요. 취소 차감은 매장 정책을 따라요.
            </Banner>
          </>
        ) : null}

        <div className="h-3.5" />
      </Body>

      {view.status === "scheduled" && !view.isFutureDay ? (
        <Footer>
          <PrimaryButton href={`/t/attend/${id}`}>출석 체크</PrimaryButton>
        </Footer>
      ) : view.status === "attended" ? (
        <Footer>
          <PrimaryButton href={`/t/record/${id}`}>
            {current?.record ? "운동 기록 수정" : "운동 기록 남기기"}
          </PrimaryButton>
        </Footer>
      ) : null}
    </div>
  );
}

/** 세션 날짜 식단 한 건 — 사진·유형·메모·시간 + 피드백(있으면 표시, 없으면 입력). */
function MealCard({ meal }: { meal: SessionMealItem }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(meal.feedback ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy || !draft.trim()) return;
    setBusy(true);
    try {
      const r = await addMealFeedback(meal.id, draft);
      if (!r.ok) return toast(r.error ?? "저장에 실패했어요", "error");
      toast("피드백을 남겼어요");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[13px] bg-[#FBF7F1] p-3">
      <div className="flex gap-3">
        {meal.photoUrl ? (
          <a
            href={meal.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="h-[58px] w-[58px] flex-none overflow-hidden rounded-[11px] bg-ink/[0.04]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={meal.photoUrl} alt="식단" className="h-full w-full object-cover" />
          </a>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            {meal.mealType ? (
              <span className="text-[12px] font-bold text-sage-deep">{meal.mealType}</span>
            ) : null}
            <span className="text-[11.5px] font-medium text-muted">{meal.timeLabel}</span>
          </div>
          {meal.memo ? <div className="text-[13px] leading-snug text-ink">{meal.memo}</div> : null}
        </div>
      </div>

      {meal.feedback && !open ? (
        <div className="mt-2.5 flex items-start gap-2 rounded-[11px] bg-[#EDF4E3] px-3 py-2">
          <Icon name="message-fill" size={13} className="mt-0.5 flex-none text-sage-deep" />
          <span className="flex-1 text-[12.5px] leading-relaxed text-[#4F5A45]">{meal.feedback}</span>
          <button onClick={() => setOpen(true)} className="flex-none text-[11.5px] font-semibold text-sage-deep">
            수정
          </button>
        </div>
      ) : open ? (
        <div className="mt-2.5">
          <PlainTextInput
            multiline
            value={draft}
            onChange={setDraft}
            placeholder="식단 피드백을 남겨주세요"
            className="min-h-[44px] w-full resize-none rounded-[11px] border border-ink/[0.12] bg-white px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className="flex-1 rounded-[10px] border border-ink/[0.12] bg-white py-2 text-[12.5px] font-semibold text-muted disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={busy || !draft.trim()}
              className="flex-[1.6] rounded-[10px] bg-sage py-2 text-[12.5px] font-semibold text-surface disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-dashed border-sage/40 py-2 text-[12.5px] font-semibold text-sage-deep"
        >
          <Icon name="message" size={13} />
          피드백 남기기
        </button>
      )}
    </div>
  );
}
