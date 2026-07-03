"use client";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { PrivacyProvider } from "./privacy";

/** Client context wrappers for the whole console (toasts + 확인 다이얼로그 + 매출 가리기). */
export function ConsoleProviders({ initialHidden = false, children }: { initialHidden?: boolean; children: React.ReactNode }) {
  return (
    <PrivacyProvider initialHidden={initialHidden}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </PrivacyProvider>
  );
}
