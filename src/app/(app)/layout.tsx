import { Frame } from "@/components/shell/Frame";
import { ToastProvider } from "@/components/ui/Toast";
import { RefreshOnFocus } from "@/components/shell/RefreshOnFocus";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Frame>
      <RefreshOnFocus />
      <ToastProvider>{children}</ToastProvider>
    </Frame>
  );
}
