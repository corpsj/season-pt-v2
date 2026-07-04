import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { MicroLabel } from "@/components/console/ui";
import { downscaleImage } from "@/lib/media/downscale";
import { validateUpload, isUploadableImage } from "@/lib/media/upload-guard";
import { uploadMemberFile, deleteMemberFile } from "@/lib/data/groups/member-files-actions";
import { saveBodyComposition, deleteBodyComposition, listBodyHistory } from "@/lib/data/groups/body-actions";
import { addMealFeedback } from "@/lib/data/groups/meals-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";
import type { BodyMeasurement } from "@/lib/data/groups/body";
import type { MealLog } from "@/lib/data/groups/meals";

const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

const mealTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/* ============================ 체형 기록 ============================ */

export function BodyRecordSection({
  memberId,
  photos,
  inbodies,
  body,
  onChanged,
}: {
  memberId: string;
  photos: MemberFileView[];
  inbodies: MemberFileView[];
  body: { weight: number; skeletalMuscle: number; bodyFat: number };
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  // 체성분 이력 — 콘솔에서 자체 로드(선택 회원 바뀌면 갱신). 저장/삭제 후 재조회.
  const [history, setHistory] = useState<BodyMeasurement[]>([]);
  const [entry, setEntry] = useState<{ weight: string; skeletalMuscle: string; bodyFat: string; measuredAt: string } | null>(null);
  useEffect(() => {
    let alive = true;
    listBodyHistory(memberId).then((h) => { if (alive) setHistory(h); });
    return () => { alive = false; };
  }, [memberId]);

  const latest = history[0];
  const bw = latest?.weight ?? (body.weight > 0 ? body.weight : null);
  const bsm = latest?.skeletalMuscle ?? (body.skeletalMuscle > 0 ? body.skeletalMuscle : null);
  const bbf = latest?.bodyFat ?? (body.bodyFat > 0 ? body.bodyFat : null);

  async function saveBody() {
    if (!entry) return;
    if (!entry.weight && !entry.skeletalMuscle && !entry.bodyFat) return toast("한 가지 이상 입력해 주세요", "error");
    setBusy(true);
    const r = await saveBodyComposition(memberId, entry);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "저장에 실패했어요", "error");
    toast("체성분을 기록했어요");
    setEntry(null);
    setHistory(await listBodyHistory(memberId));
  }
  async function removeBody(id: string) {
    if (busy) return;
    if (!(await confirm({ title: "이 기록을 삭제할까요?", description: "삭제하면 되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(true);
    const r = await deleteBodyComposition(id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    setHistory(await listBodyHistory(memberId));
  }

  async function upload(kind: "photo" | "inbody", file: File) {
    if (kind === "inbody") {
      const v = validateUpload("inbody", file.type, file.size);
      if (!v.ok) return toast(v.error, "error");
    }
    setBusy(true);
    try {
      const blob = kind === "photo" ? await downscaleImage(file) : file;
      // 사진 축소 실패로 원본(HEIC 등)이 그대로면 jpg 이름·이형 contentType로 올라가므로 차단
      if (kind === "photo" && !isUploadableImage(blob.type)) return toast("지원하지 않는 사진 형식이에요. 다시 선택해 주세요.", "error");
      const fd = new FormData();
      fd.set("memberId", memberId);
      fd.set("kind", kind);
      fd.set("file", blob, kind === "photo" ? "photo.jpg" : file.name);
      const r = await uploadMemberFile(fd);
      if (!r.ok) return toast(r.error ?? "업로드에 실패했어요", "error");
      toast(kind === "photo" ? "사진을 저장했어요" : "인바디를 저장했어요");
      await onChanged();
    } catch {
      toast("업로드에 실패했어요", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    if (!(await confirm({ title: "이 파일을 삭제할까요?", description: "삭제하면 되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(true);
    const r = await deleteMemberFile(id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    await onChanged();
  }

  return (
    <>
      {/* 체성분 */}
      <div className="mb-2.5 flex items-center justify-between">
        <MicroLabel>체성분</MicroLabel>
        <button
          type="button"
          onClick={() => setEntry({ weight: "", skeletalMuscle: "", bodyFat: "", measuredAt: todayKst() })}
          disabled={busy || !!entry}
          className="inline-flex items-center gap-1 rounded-[9px] bg-sage px-2.5 py-[6px] text-[12px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
        >
          <Icon name="plus" size={13} />기록
        </button>
      </div>

      {bw != null || bsm != null || bbf != null ? (
        <div className="mb-2.5 grid grid-cols-3 gap-2.5">
          {[{ l: "체중", v: bw, u: "kg" }, { l: "골격근", v: bsm, u: "kg" }, { l: "체지방", v: bbf, u: "%" }].map((b) => (
            <div key={b.l} className="rounded-[14px] bg-[#FBF7F1] p-3.5">
              <div className="mb-1 text-[11px] font-medium text-[#9A917F]">{b.l}</div>
              <div><span className="serif text-[21px] font-semibold text-ink">{b.v ?? "–"}</span>{b.v != null ? <span className="ml-0.5 text-[11px] font-medium text-[#9A917F]">{b.u}</span> : null}</div>
            </div>
          ))}
        </div>
      ) : null}

      {entry ? (
        <div className="mb-2.5 rounded-[14px] border border-ink/[0.1] bg-white p-3.5">
          <div className="mb-2.5 grid grid-cols-3 gap-2.5">
            {([["weight", "체중 (kg)"], ["skeletalMuscle", "골격근 (kg)"], ["bodyFat", "체지방 (%)"]] as const).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1 text-[11px] font-medium text-[#9A917F]">{label}</div>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={entry[k]}
                  onChange={(e) => setEntry({ ...entry, [k]: e.target.value })}
                  className="w-full rounded-[10px] border border-ink/[0.12] bg-white px-2.5 py-2 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                />
              </div>
            ))}
          </div>
          <div className="mb-2.5">
            <div className="mb-1 text-[11px] font-medium text-[#9A917F]">측정일</div>
            <input
              type="date"
              value={entry.measuredAt}
              max={todayKst()}
              onChange={(e) => setEntry({ ...entry, measuredAt: e.target.value })}
              className="w-full rounded-[10px] border border-ink/[0.12] bg-white px-2.5 py-2 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
            />
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setEntry(null)} disabled={busy} className="flex-1 rounded-[10px] border border-ink/[0.12] bg-white py-2 text-[12.5px] font-semibold text-[#766D60] disabled:opacity-50">취소</button>
            <button type="button" onClick={saveBody} disabled={busy} className="flex-[1.6] rounded-[10px] bg-sage py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">저장</button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="mb-[18px] flex flex-col divide-y divide-ink/[0.06] rounded-[13px] bg-[#FBF7F1] px-3.5">
          {history.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-2.5 text-[12.5px]">
              <span className="w-[58px] flex-none font-medium text-[#9A917F]">{b.measuredAt.replace(/-/g, ".").slice(2)}</span>
              <span className="min-w-0 flex-1 font-semibold text-ink">
                {[b.weight != null ? `${b.weight}kg` : null, b.skeletalMuscle != null ? `골격근 ${b.skeletalMuscle}` : null, b.bodyFat != null ? `체지방 ${b.bodyFat}%` : null].filter(Boolean).join(" · ")}
              </span>
              {b.selfRecorded ? <span className="flex-none rounded-md bg-[#EDF4E3] px-1.5 py-0.5 text-[10px] font-bold text-sage-deep">회원 기록</span> : null}
              <button type="button" onClick={() => removeBody(b.id)} disabled={busy} aria-label="삭제" className="flex-none text-[#A89F92] disabled:opacity-50">
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-[18px] rounded-[13px] bg-[#FBF7F1] py-4 text-center text-[12.5px] font-medium text-[#A89F92]">아직 체성분 기록이 없어요</div>
      )}

      {/* 진행 사진 */}
      <div className="mb-2.5 flex items-center justify-between">
        <MicroLabel>진행 사진</MicroLabel>
        <AddButton accept="image/*" busy={busy} label="사진 추가" onPick={(f) => upload("photo", f)} />
      </div>
      {photos.length > 0 ? (
        <div className="mb-[18px] grid grid-cols-4 gap-2">
          {photos.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-[12px] bg-[#F1EDE6]">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => remove(f.id)}
                disabled={busy}
                aria-label="삭제"
                className="absolute right-1 top-1 rounded-full bg-ink/60 p-1 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-[18px] rounded-[13px] bg-[#FBF7F1] py-4 text-center text-[12.5px] font-medium text-[#A89F92]">아직 사진이 없어요</div>
      )}

      {/* 인바디 */}
      <div className="mb-2.5 flex items-center justify-between">
        <MicroLabel>인바디</MicroLabel>
        <AddButton accept="application/pdf" busy={busy} label="PDF 추가" onPick={(f) => upload("inbody", f)} />
      </div>
      {inbodies.length > 0 ? (
        <div className="mb-[18px] flex flex-col divide-y divide-ink/[0.06] rounded-[13px] bg-[#FBF7F1] px-3.5">
          {inbodies.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-2.5">
              <Icon name="document-text" size={16} className="flex-none text-sage-deep" />
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="flex-1 truncate text-[13px] font-semibold text-ink">
                인바디 · {f.takenAt.replace(/-/g, ".")}
              </a>
              <button type="button" onClick={() => remove(f.id)} disabled={busy} aria-label="삭제" className="flex-none text-[#A89F92] disabled:opacity-50">
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-[18px] rounded-[13px] bg-[#FBF7F1] py-4 text-center text-[12.5px] font-medium text-[#A89F92]">아직 인바디 결과가 없어요</div>
      )}
    </>
  );
}

function AddButton({ accept, label, busy, onPick }: { accept: string; label: string; busy: boolean; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-[9px] bg-sage px-2.5 py-[6px] text-[12px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
      >
        <Icon name="plus" size={13} />
        {busy ? "올리는 중…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
    </>
  );
}

/* ============================== 식단 ============================== */

export function MealsSection({ meals, onChanged }: { meals: MealLog[]; onChanged: () => void | Promise<void> }) {
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = meals.filter((m) => !m.feedback).length;

  function edit(m: MealLog) {
    setOpenId(m.id);
    setDraft(m.feedback ?? "");
  }
  async function save(id: string) {
    if (busy || !draft.trim()) return;
    setBusy(true);
    const r = await addMealFeedback(id, draft);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "저장에 실패했어요", "error");
    toast("피드백을 남겼어요");
    setOpenId(null);
    await onChanged();
  }

  return (
    <>
      <div className="mb-2.5 flex items-center gap-2">
        <MicroLabel>식단</MicroLabel>
        {pending > 0 ? <span className="rounded-md bg-[#FBF3E9] px-1.5 py-0.5 text-[11px] font-bold text-terracotta">피드백 {pending}</span> : null}
        <span className="ml-auto text-[12px] font-medium text-[#9A917F]">{meals.length}개</span>
      </div>

      {meals.length === 0 ? (
        <div className="rounded-[13px] bg-[#FBF7F1] py-5 text-center text-[12.5px] font-medium text-[#A89F92]">아직 식단 기록이 없어요</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {meals.map((m) => (
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
                    <span className="text-[11.5px] font-medium text-[#9A917F]">{mealTime(m.eatenAt)}</span>
                  </div>
                  {m.memo ? <div className="text-[13px] leading-snug text-ink">{m.memo}</div> : null}
                </div>
              </div>

              {m.feedback && openId !== m.id ? (
                <div className="mt-2.5 flex items-start gap-2 rounded-[11px] bg-[#EDF4E3] px-3 py-2">
                  <Icon name="message-fill" size={13} className="mt-0.5 flex-none text-sage-deep" />
                  <span className="flex-1 text-[12.5px] leading-relaxed text-[#4F5A45]">{m.feedback}</span>
                  <button type="button" onClick={() => edit(m)} className="flex-none text-[11.5px] font-semibold text-sage-deep">수정</button>
                </div>
              ) : openId === m.id ? (
                <div className="mt-2.5">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="식단 피드백을 남겨주세요"
                    rows={2}
                    className="w-full resize-none rounded-[11px] border border-ink/[0.12] bg-white px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" onClick={() => setOpenId(null)} disabled={busy} className="flex-1 rounded-[10px] border border-ink/[0.12] bg-white py-2 text-[12.5px] font-semibold text-[#766D60] disabled:opacity-50">취소</button>
                    <button type="button" onClick={() => save(m.id)} disabled={busy || !draft.trim()} className="flex-[1.6] rounded-[10px] bg-sage py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">저장</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => edit(m)} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-dashed border-sage/40 py-2 text-[12.5px] font-semibold text-sage-deep">
                  <Icon name="message" size={13} />피드백 남기기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
