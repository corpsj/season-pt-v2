"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { downscaleImage } from "@/lib/media/downscale";
import { validateUpload } from "@/lib/media/upload-guard";
import { uploadMemberFile, deleteMemberFile } from "@/lib/data/groups/member-files-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";

const CFG = {
  // capture 미강제 — 카메라 전용이면 이미 찍어둔 사진(갤러리)을 못 올린다(감사 #27과 동일 문제)
  photo: { title: "진행 사진", icon: "camera", accept: "image/*", capture: false, empty: "아직 사진이 없어요" },
  inbody: { title: "인바디", icon: "document-text", accept: "application/pdf", capture: false, empty: "아직 인바디 결과가 없어요" },
} as const;

export function MemberFilesSection({
  kind,
  memberId,
  initial,
  takenAt,
}: {
  kind: "photo" | "inbody";
  memberId: string;
  initial: MemberFileView[];
  takenAt?: string; // 지정 시 업로드를 이 날짜로 태깅(수업 상세에서 세션 날짜로). 미지정=서버가 오늘로.
}) {
  const cfg = CFG[kind];
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, refresh] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file || busy) return;
    if (kind === "inbody") {
      const v = validateUpload("inbody", file.type, file.size);
      if (!v.ok) return toast(v.error, "error");
    }
    setBusy(true);
    try {
      const blob = kind === "photo" ? await downscaleImage(file) : file;
      const fd = new FormData();
      fd.set("memberId", memberId);
      fd.set("kind", kind);
      if (takenAt) fd.set("takenAt", takenAt);
      fd.set("file", blob, kind === "photo" ? "photo.jpg" : file.name);
      const r = await uploadMemberFile(fd);
      if (!r.ok) toast(r.error ?? "업로드에 실패했어요", "error");
      else {
        toast(kind === "photo" ? "사진을 저장했어요" : "인바디를 저장했어요");
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
    if (!(await confirm({ title: "이 파일을 삭제할까요?", description: "삭제하면 되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(true);
    try {
      const r = await deleteMemberFile(id);
      if (!r.ok) toast(r.error ?? "삭제에 실패했어요", "error");
      else refresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3.5 px-4 py-[14px]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-muted5">{cfg.title}</span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 text-[12px] font-semibold text-surface disabled:opacity-50"
        >
          <Icon name={cfg.icon} size={13} />
          {busy ? "올리는 중…" : "추가"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={cfg.accept}
          {...(cfg.capture ? { capture: "environment" as const } : {})}
          className="hidden"
          onChange={onPick}
        />
      </div>

      {initial.length === 0 ? (
        <div className="py-4 text-center text-[12.5px] font-medium text-muted">{cfg.empty}</div>
      ) : kind === "photo" ? (
        <div className="grid grid-cols-3 gap-2">
          {initial.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                </a>
              ) : null}
              <button
                onClick={() => onDelete(f.id)}
                disabled={busy}
                className="absolute right-1 top-1 rounded-full bg-ink/60 p-1 text-surface disabled:opacity-50"
                aria-label="삭제"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-ink/[0.06]">
          {initial.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-2.5">
              <Icon name="document-text" size={16} className="flex-none text-sage" />
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="flex-1 truncate text-[13px] font-semibold text-ink">
                인바디 · {f.takenAt.replace(/-/g, ".")}
              </a>
              <button onClick={() => onDelete(f.id)} disabled={busy} className="flex-none text-muted disabled:opacity-50" aria-label="삭제">
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
