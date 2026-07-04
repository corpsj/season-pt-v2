"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { downscaleImage } from "@/lib/media/downscale";
import { isUploadableImage } from "@/lib/media/upload-guard";
import { logMeal, updateMeal, deleteMeal, loadMoreMeals } from "@/lib/data/groups/meals-actions";
import type { MealLog } from "@/lib/data/groups/meals";

const TYPES = ["아침", "점심", "저녁", "간식"] as const;
const todayKstDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD

const kst = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", ...opts });
const dayKey = (iso: string) => kst(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const timeLabel = (iso: string) => kst(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
function dayLabel(iso: string): string {
  const today = dayKey(new Date().toISOString());
  const y = new Date(Date.now() - 86400000).toISOString();
  if (dayKey(iso) === today) return "오늘";
  if (dayKey(iso) === dayKey(y)) return "어제";
  return kst(iso, { month: "long", day: "numeric", weekday: "short" });
}

export function MemberMealsClient({
  initial,
  initialHasMore,
  initialOpen = false,
  initialDate,
}: {
  initial: MealLog[];
  initialHasMore: boolean;
  initialOpen?: boolean;
  initialDate?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, refresh] = useTransition();
  const [open, setOpen] = useState(initialOpen);
  const [busy, setBusy] = useState(false);
  const [mealType, setMealType] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState<string>(initialDate ?? todayKstDate());
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // 수정 모드(카드별): editingId 있으면 해당 카드가 인라인 편집 상태.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMemo, setEditMemo] = useState("");
  const [editType, setEditType] = useState<string>("");
  const [extra, setExtra] = useState<MealLog[]>([]);
  const [offset, setOffset] = useState(60);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    if (busy || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const r = await loadMoreMeals(offset);
      setExtra((prev) => [...prev, ...r.meals]);
      setOffset((o) => o + 60);
      setHasMore(r.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }
  // 목록이 바뀌면(추가·삭제) 절대 offset 기반 페이지 창이 어긋난다 — 페이지네이션 리셋 후 router.refresh()로 top-60만 다시 그린다(다음 더보기는 깨끗한 상태에서 재요청).
  function resetPaging() {
    setExtra([]);
    setOffset(60);
    setHasMore(initialHasMore);
  }

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  }
  function reset() {
    setOpen(false);
    setMealType("");
    setMemo("");
    setDate(todayKstDate());
    setPhoto(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }
  async function submit() {
    if (busy) return;
    if (!photo && !memo.trim()) return toast("사진이나 메모를 입력해주세요", "error");
    setBusy(true);
    try {
      const fd = new FormData();
      if (mealType) fd.set("mealType", mealType);
      if (memo.trim()) fd.set("memo", memo.trim());
      // 오늘이면 서버가 now()로 기록(실제 시각 보존), 지난 날짜만 eatenAt 전달(정오 KST).
      if (date && date !== todayKstDate()) fd.set("eatenAt", date);
      if (photo) {
        const blob = await downscaleImage(photo);
        // 축소 실패로 원본(HEIC 등)이 그대로면 jpg 이름·이형 contentType로 올라가므로 차단
        if (!isUploadableImage(blob.type)) return toast("지원하지 않는 사진 형식이에요. 다시 선택해 주세요.", "error");
        fd.set("photo", blob, "meal.jpg");
      }
      const r = await logMeal(fd);
      if (!r.ok) return toast(r.error ?? "기록에 실패했어요", "error");
      toast("식단을 기록했어요");
      reset();
      resetPaging();
      refresh(() => router.refresh());
    } catch {
      toast("기록에 실패했어요", "error");
    } finally {
      setBusy(false);
    }
  }
  function startEdit(m: MealLog) {
    setEditingId(m.id);
    setEditMemo(m.memo ?? "");
    setEditType(m.mealType ?? "");
  }
  async function saveEdit(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await updateMeal(id, { memo: editMemo, mealType: editType });
      if (!r.ok) return toast(r.error ?? "수정에 실패했어요", "error");
      toast("수정했어요");
      setEditingId(null);
      resetPaging();
      refresh(() => router.refresh());
    } catch {
      toast("수정에 실패했어요", "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!(await confirm({ title: "이 식단 기록을 삭제할까요?", description: "사진과 선생님 피드백도 함께 삭제되고 되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    if (busy) return;
    setBusy(true);
    try {
      const r = await deleteMeal(id);
      if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
      resetPaging();
      refresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  // group by day
  const groups: { label: string; items: MealLog[] }[] = [];
  for (const m of [...initial, ...extra]) {
    const label = dayLabel(m.eatenAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">식단 관리</span>
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="ml-auto inline-flex items-center gap-1 rounded-[12px] bg-sage px-3 py-2 text-[13px] font-semibold text-surface active:scale-[.97]"
            >
              <Icon name="plus-bold" size={14} />기록
            </button>
          ) : null}
        </div>

        {open ? (
          <Card className="mb-4 p-[18px]">
            <div className="mb-3 flex gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setMealType(mealType === t ? "" : t)}
                  className={`flex-1 rounded-[11px] py-2 text-[13px] font-semibold transition ${mealType === t ? "bg-sage text-surface" : "bg-[#F4F0E8] text-muted"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {preview ? (
              <div className="relative mb-3 overflow-hidden rounded-[14px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="미리보기" className="max-h-[220px] w-full object-cover" />
                <button
                  onClick={() => { if (preview) URL.revokeObjectURL(preview); setPreview(null); setPhoto(null); }}
                  className="absolute right-2 top-2 rounded-full bg-ink/60 p-1.5 text-surface"
                  aria-label="사진 제거"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.4px] border-dashed border-ink/20 bg-[#FBF9F5] py-5 text-[13.5px] font-semibold text-muted active:scale-[.99]"
              >
                <Icon name="camera" size={18} />사진 추가
              </button>
            )}
            {/* capture 미지정 — 카메라 강제 시 이미 찍어둔 음식 사진(갤러리)을 첨부할 수 없다(감사 #27) */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="무엇을 드셨나요? (예: 닭가슴살 샐러드, 고구마)"
              rows={2}
              className="mb-3 w-full resize-none rounded-[13px] border border-ink/[0.12] bg-[#FBF9F5] px-3.5 py-3 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
            />

            <div className="mb-3 flex items-center gap-2">
              <Icon name="calendar" size={16} className="flex-none text-muted" />
              <span className="text-[13px] font-semibold text-muted">날짜</span>
              <input
                type="date"
                value={date}
                max={todayKstDate()}
                onChange={(e) => setDate(e.target.value)}
                className="ml-auto rounded-[11px] border border-ink/[0.12] bg-[#FBF9F5] px-3 py-2 text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={reset} disabled={busy} className="flex-1 rounded-[13px] border border-ink/[0.12] bg-white py-3 text-[14px] font-semibold text-muted disabled:opacity-50">취소</button>
              <button onClick={submit} disabled={busy} className="flex-[1.6] rounded-[13px] bg-sage py-3 text-[14px] font-semibold text-surface disabled:opacity-50">{busy ? "기록 중…" : "기록하기"}</button>
            </div>
          </Card>
        ) : null}

        {initial.length === 0 && !open ? (
          <EmptyState icon="fire" title="아직 식단 기록이 없어요" desc="먹은 음식을 사진·메모로 남기면 선생님이 피드백을 드려요." />
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="mb-2 px-1 text-[12.5px] font-semibold text-muted5">{g.label}</div>
              <div className="flex flex-col gap-2.5">
                {g.items.map((m) => (
                  <Card key={m.id} className="overflow-hidden">
                    {m.photoUrl ? (
                      // NoZoom로 인라인 핀치가 막히므로 새 탭(Safari 기본 뷰어)에서 확대하도록 감쌈
                      <a href={m.photoUrl} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.photoUrl} alt="식단" className="max-h-[240px] w-full object-cover" />
                      </a>
                    ) : null}
                    <div className="p-[15px]">
                      <div className="mb-1 flex items-center gap-2">
                        {m.mealType ? <span className="rounded-md bg-[#EDF4E3] px-2 py-0.5 text-[11.5px] font-bold text-sage-deep">{m.mealType}</span> : null}
                        <span className="text-[12px] font-medium text-muted">{timeLabel(m.eatenAt)}</span>
                        {editingId !== m.id ? (
                          <>
                            <button onClick={() => startEdit(m)} disabled={busy} className="ml-auto text-[#C2BAAD] disabled:opacity-50" aria-label="수정">
                              <Icon name="pencil" size={16} />
                            </button>
                            <button onClick={() => remove(m.id)} disabled={busy} className="text-[#C2BAAD] disabled:opacity-50" aria-label="삭제">
                              <Icon name="close" size={16} />
                            </button>
                          </>
                        ) : null}
                      </div>
                      {editingId === m.id ? (
                        <div className="mt-2">
                          <div className="mb-2.5 flex gap-1.5">
                            {TYPES.map((t) => (
                              <button
                                key={t}
                                onClick={() => setEditType(editType === t ? "" : t)}
                                className={`flex-1 rounded-[11px] py-1.5 text-[12.5px] font-semibold transition ${editType === t ? "bg-sage text-surface" : "bg-[#F4F0E8] text-muted"}`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={editMemo}
                            onChange={(e) => setEditMemo(e.target.value)}
                            placeholder="무엇을 드셨나요?"
                            rows={2}
                            className="mb-2.5 w-full resize-none rounded-[13px] border border-ink/[0.12] bg-[#FBF9F5] px-3.5 py-3 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
                          />
                          {m.feedback ? (
                            <div className="mb-2.5 rounded-[11px] bg-[#FBF6EC] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#8A7A55]">
                              선생님 피드백이 달린 기록이에요 — 내용을 바꾸면 피드백과 어긋날 수 있어요.
                            </div>
                          ) : null}
                          <div className="flex gap-2">
                            <button onClick={() => setEditingId(null)} disabled={busy} className="flex-1 rounded-[12px] border border-ink/[0.12] bg-white py-2.5 text-[13.5px] font-semibold text-muted disabled:opacity-50">취소</button>
                            <button onClick={() => saveEdit(m.id)} disabled={busy} className="flex-[1.6] rounded-[12px] bg-sage py-2.5 text-[13.5px] font-semibold text-surface disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                      {m.memo ? <div className="text-[14px] leading-relaxed text-ink">{m.memo}</div> : null}
                      {m.feedback ? (
                        <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-[#EDF4E3] px-3.5 py-3">
                          <Icon name="message-fill" size={15} className="mt-0.5 flex-none text-sage-deep" />
                          <div>
                            <div className="mb-0.5 text-[11.5px] font-bold text-sage-deep">선생님 피드백</div>
                            <div className="text-[13px] leading-relaxed text-[#4F5A45]">{m.feedback}</div>
                          </div>
                        </div>
                      ) : null}
                        </>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-1 w-full rounded-[13px] border border-ink/[0.12] bg-white py-3 text-[13.5px] font-semibold text-muted disabled:opacity-50"
          >
            {loadingMore ? "불러오는 중…" : "더보기"}
          </button>
        ) : null}
        <div className="h-2" />
      </Body>
    </div>
  );
}
