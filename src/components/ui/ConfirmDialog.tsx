"use client";
import { createContext, useCallback, useContext, useState } from "react";

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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 px-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
