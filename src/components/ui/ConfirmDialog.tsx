"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    const frame = window.requestAnimationFrame(() => {
      (cancelRef.current ?? focusable()[0] ?? dialog)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const confirmCls =
    tone === "warn"
      ? "tappable flex h-[48px] flex-1 items-center justify-center rounded-[13px] bg-terracotta text-[15px] font-bold text-white"
      : "tappable flex h-[48px] flex-1 items-center justify-center rounded-[13px] bg-sage text-[15px] font-bold text-surface";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 px-6"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-[320px] rounded-[20px] border border-ink/[0.055] bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-4 pt-5">
          <p id={titleId} className="text-[16px] font-bold text-ink">{title}</p>
          {description && (
            <p id={descriptionId} className="mt-1.5 text-[13.5px] font-medium leading-snug text-muted">
              {description}
            </p>
          )}
        </div>
        <div className="flex gap-2.5 px-5 pb-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="tappable flex h-[48px] flex-1 items-center justify-center rounded-[13px] bg-chip-soft text-[15px] font-bold text-ink"
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

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
};

const ConfirmContext = createContext<(opts: ConfirmOpts) => Promise<boolean>>(() =>
  Promise.resolve(false)
);

/** window.confirm 대체: `const ok = await confirm({ title, tone: "warn" })`.
 *  네이티브 브라우저 다이얼로그 대신 앱 스타일 ConfirmDialog를 띄운다. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setReq({ ...opts, resolve })),
    []
  );

  function settle(v: boolean) {
    req?.resolve(v);
    setReq(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req ? (
        <ConfirmDialog
          open
          title={req.title}
          description={req.description}
          confirmLabel={req.confirmLabel ?? "확인"}
          cancelLabel={req.cancelLabel}
          tone={req.tone}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}
