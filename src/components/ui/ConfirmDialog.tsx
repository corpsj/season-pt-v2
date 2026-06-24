"use client";

type Tone = "default" | "warn";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const confirmCls =
    tone === "warn"
      ? "flex h-[48px] flex-1 items-center justify-center rounded-[13px] bg-terracotta text-[15px] font-bold text-white"
      : "flex h-[48px] flex-1 items-center justify-center rounded-[13px] bg-sage text-[15px] font-bold text-surface";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[320px] rounded-[20px] border border-ink/[0.055] bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-4 pt-5">
          <p className="text-[16px] font-bold text-ink">{title}</p>
          {description && (
            <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-muted">
              {description}
            </p>
          )}
        </div>
        <div className="flex gap-2.5 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[48px] flex-1 items-center justify-center rounded-[13px] bg-chip-soft text-[15px] font-bold text-ink"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={confirmCls}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
