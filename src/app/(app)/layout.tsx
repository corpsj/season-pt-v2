import { Frame } from "@/components/shell/Frame";
import { ToastProvider } from "@/components/ui/Toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Frame>
      <ToastProvider>{children}</ToastProvider>
    </Frame>
  );
}
