"use client";
import { ToastProvider } from "@/components/ui/Toast";
import { PrivacyProvider } from "./privacy";

/** Client context wrappers for the whole console (toasts + 매출 가리기). */
export function ConsoleProviders({ initialHidden = false, children }: { initialHidden?: boolean; children: React.ReactNode }) {
  return (
    <PrivacyProvider initialHidden={initialHidden}>
      <ToastProvider>{children}</ToastProvider>
    </PrivacyProvider>
  );
}
