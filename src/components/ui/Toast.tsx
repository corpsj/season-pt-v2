"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "./icon";

type ShowToast = (message: string) => void;
const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>((message) => {
    setMsg(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 1900);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg ? (
        <div className="toast-in absolute bottom-9 left-1/2 z-50 flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[14px] bg-frame px-4 py-3 shadow-toast">
          <Icon name="circle-check-fill" size={18} className="shrink-0 text-sage-leaf" />
          <span className="text-[13px] font-semibold text-surface">{msg}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
