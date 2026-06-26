"use client";
import { ToastProvider } from "@/components/ui/Toast";
import { PrivacyProvider } from "./privacy";

/** Client context wrappers for the whole console (toasts + 매출 가리기). */
export function ConsoleProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      <ToastProvider>{children}</ToastProvider>
    </PrivacyProvider>
  );
}
