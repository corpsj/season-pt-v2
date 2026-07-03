"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "./icon";

type ToastTone = "success" | "error";
type ShowToast = (message: string, tone?: ToastTone) => void;
const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>((message, tone = "success") => {
    setToast({ msg: message, tone });
    if (timer.current) clearTimeout(timer.current);
    // 에러는 읽을 시간을 조금 더 준다
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 2600 : 1900);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div className="toast-in absolute bottom-9 left-1/2 z-50 flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[14px] bg-frame px-4 py-3 shadow-toast">
          <Icon
            name={toast.tone === "error" ? "circle-exclamation" : "circle-check-fill"}
            size={18}
            className={`shrink-0 ${toast.tone === "error" ? "text-terracotta" : "text-sage-leaf"}`}
          />
          <span className="text-[13px] font-semibold text-surface">{toast.msg}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
