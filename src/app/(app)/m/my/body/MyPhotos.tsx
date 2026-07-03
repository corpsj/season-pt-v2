"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { downscaleImage } from "@/lib/media/downscale";
import { uploadMyFile, deleteMyFile } from "@/lib/data/groups/member-files-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";

/** 회원 본인이 진행 사진을 직접 올리고 지워요. */
export function MyPhotos({ initial }: { initial: MemberFileView[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, refresh] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    try {
      const blob = await downscaleImage(file);
      const fd = new FormData();
      fd.set("file", blob, "photo.jpg");
      const r = await uploadMyFile(fd);
      if (!r.ok) toast(r.error ?? "업로드에 실패했어요", "error");
      else {
        toast("사진을 올렸어요");
        refresh(() => router.refresh());
      }
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

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="text-[12.5px] font-semibold text-muted5">진행 사진</span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 text-[12px] font-semibold text-surface disabled:opacity-50"
        >
          <Icon name="camera" size={13} />
          {busy ? "올리는 중…" : "사진 추가"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      </div>
      {initial.length === 0 ? (
        <div className="mb-4 rounded-[13px] bg-ink/[0.03] py-5 text-center text-[12.5px] font-medium text-muted">
          아직 사진이 없어요. 직접 올리거나 수업 때 선생님이 남겨드려요.
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {initial.map((f) =>
            f.url ? (
              <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
                <a href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                </a>
                <button
                  onClick={() => onDelete(f.id)}
                  disabled={busy}
                  className="absolute right-1 top-1 rounded-full bg-ink/60 p-1 text-surface disabled:opacity-50"
                  aria-label="삭제"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ) : null,
          )}
        </div>
      )}
    </>
  );
}
