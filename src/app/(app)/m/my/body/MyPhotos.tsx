"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { downscaleImage } from "@/lib/media/downscale";
import { isUploadableImage } from "@/lib/media/upload-guard";
import { uploadMyFile, deleteMyFile } from "@/lib/data/groups/member-files-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";

const todayKstDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
const dateLabel = (iso: string) => iso.slice(2).replace(/-/g, ".");

/** 회원 본인이 진행 사진을 직접 올리고(찍은 날짜 지정) 지우고, 두 장을 골라 비교해요. */
export function MyPhotos({ initial }: { initial: MemberFileView[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, refresh] = useTransition();
  // 업로드 대기 상태 — 파일 고르면 미리보기 + 찍은 날짜 확인 후 올린다.
  const [pending, setPending] = useState<{ file: File; preview: string; date: string } | null>(null);
  // 비교 모드 — 사진 두 장을 골라 나란히 본다.
  const [compare, setCompare] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    if (pending) URL.revokeObjectURL(pending.preview);
    setPending({ file, preview: URL.createObjectURL(file), date: todayKstDate() });
  }
  function cancelPending() {
    if (pending) URL.revokeObjectURL(pending.preview);
    setPending(null);
  }
  async function upload() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const blob = await downscaleImage(pending.file);
      // 축소 실패로 원본(HEIC 등)이 그대로면 jpg 이름·이형 contentType로 올라가므로 차단
      if (!isUploadableImage(blob.type)) return toast("지원하지 않는 사진 형식이에요. 다시 선택해 주세요.", "error");
      const fd = new FormData();
      fd.set("file", blob, "photo.jpg");
      if (pending.date && pending.date !== todayKstDate()) fd.set("takenAt", pending.date);
      const r = await uploadMyFile(fd);
      if (!r.ok) return toast(r.error ?? "업로드에 실패했어요", "error");
      toast("사진을 올렸어요");
      cancelPending();
      refresh(() => router.refresh());
    } catch {
      toast("업로드에 실패했어요", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (busy) return;
    if (!(await confirm({ title: "이 사진을 지울까요?", description: "지우면 되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(true);
    try {
      const r = await deleteMyFile(id);
      if (!r.ok) toast(r.error ?? "삭제에 실패했어요", "error");
      else refresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  function togglePick(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id],
    );
  }
  function exitCompare() {
    setCompare(false);
    setPicked([]);
  }

  const photos = initial.filter((f) => f.url);
  const pair = picked
    .map((id) => photos.find((f) => f.id === id))
    .filter((f): f is MemberFileView => !!f)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt)); // 왼쪽=이전, 오른쪽=최근

  return (
    <>
      <div className="mb-2.5 flex items-center gap-1.5 px-0.5">
        <span className="mr-auto text-[12.5px] font-semibold text-muted5">진행 사진</span>
        {photos.length >= 2 ? (
          <button
            onClick={() => (compare ? exitCompare() : setCompare(true))}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${compare ? "bg-ink/[0.08] text-ink" : "border border-ink/[0.12] bg-white text-muted"}`}
          >
            {compare ? "비교 끝" : "비교"}
          </button>
        ) : null}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy || !!pending}
          className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 text-[12px] font-semibold text-surface disabled:opacity-50"
        >
          <Icon name="camera" size={13} />사진 추가
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      </div>

      {/* 업로드 확인 — 미리보기 + 찍은 날짜 */}
      {pending ? (
        <div className="mb-3 rounded-[14px] border border-ink/[0.08] bg-card p-3">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.preview} alt="미리보기" className="h-[84px] w-[84px] flex-none rounded-[11px] object-cover" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <span className="text-[12.5px] font-semibold text-muted">찍은 날짜</span>
              <input
                type="date"
                value={pending.date}
                max={todayKstDate()}
                onChange={(e) => setPending({ ...pending, date: e.target.value })}
                className="rounded-[11px] border border-ink/[0.12] bg-[#FBF9F5] px-3 py-2 text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              />
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={cancelPending} disabled={busy} className="flex-1 rounded-[12px] border border-ink/[0.12] bg-white py-2.5 text-[13.5px] font-semibold text-muted disabled:opacity-50">취소</button>
            <button onClick={upload} disabled={busy} className="flex-[1.6] rounded-[12px] bg-sage py-2.5 text-[13.5px] font-semibold text-surface disabled:opacity-50">{busy ? "올리는 중…" : "올리기"}</button>
          </div>
        </div>
      ) : null}

      {/* 비교 패널 — 두 장 선택 시 나란히 */}
      {compare ? (
        pair.length === 2 ? (
          <div className="mb-3 rounded-[14px] border border-ink/[0.08] bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              {pair.map((f) => (
                <div key={f.id}>
                  <a href={f.url!} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[11px] bg-ink/[0.04]">
                    {/* NoZoom로 인라인 핀치가 막히므로 새 탭(Safari 기본 뷰어)에서 확대하도록 감쌈 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url!} alt={f.takenAt} className="aspect-[3/4] w-full object-cover" />
                  </a>
                  <div className="mt-1 text-center text-[11px] font-semibold text-muted2">{dateLabel(f.takenAt)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3 rounded-[13px] bg-[#F8F4EC] px-4 py-3 text-center text-[12px] font-medium text-[#766D60]">
            비교할 사진 두 장을 아래에서 골라주세요 ({pair.length}/2)
          </div>
        )
      ) : null}

      {photos.length === 0 ? (
        <div className="mb-4 rounded-[13px] bg-ink/[0.03] py-5 text-center text-[12.5px] font-medium text-muted">
          아직 사진이 없어요. 직접 올리거나 수업 때 선생님이 남겨드려요.
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {photos.map((f) => {
            const sel = picked.includes(f.id);
            return (
              <div key={f.id} className={`group relative overflow-hidden rounded-xl bg-ink/[0.04] ${sel ? "ring-2 ring-sage" : ""}`}>
                {compare ? (
                  <button onClick={() => togglePick(f.id)} className="block aspect-square w-full" aria-label={`${f.takenAt} 사진 ${sel ? "선택 해제" : "선택"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url!} alt={f.takenAt} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <a href={f.url!} target="_blank" rel="noreferrer" className="block aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url!} alt={f.takenAt} className="h-full w-full object-cover" />
                  </a>
                )}
                <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-ink/55 px-1.5 py-0.5 text-[9.5px] font-semibold text-surface">
                  {dateLabel(f.takenAt)}
                </span>
                {!compare ? (
                  <button
                    onClick={() => onDelete(f.id)}
                    disabled={busy}
                    className="absolute right-1 top-1 rounded-full bg-ink/60 p-1 text-surface disabled:opacity-50"
                    aria-label="삭제"
                  >
                    <Icon name="close" size={12} />
                  </button>
                ) : sel ? (
                  <span className="pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sage text-surface">
                    <Icon name="check-bold" size={11} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
