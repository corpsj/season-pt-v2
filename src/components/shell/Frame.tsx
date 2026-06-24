import { StatusBar } from "./StatusBar";
import { HomeIndicator } from "./HomeIndicator";

/**
 * Device frame. Desktop: 380×812 phone with bezel on the warm canvas.
 * Mobile: full-screen surface with safe-area padding (real device chrome).
 */
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas sm:p-6">
      <div className="relative h-dvh w-full sm:h-[812px] sm:max-h-[calc(100dvh_-_3rem)] sm:w-[380px] sm:rounded-[54px] sm:bg-frame sm:p-[9px] sm:shadow-frame">
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface sm:rounded-[46px]">
          {/* dynamic island (preview chrome) */}
          <div className="absolute left-1/2 top-3 z-30 hidden h-[30px] w-[106px] -translate-x-1/2 rounded-2xl bg-island sm:block" />
          <StatusBar />
          <div className="flex min-h-0 flex-1 flex-col pt-[var(--safe-t)] sm:pt-0">
            {children}
          </div>
          <HomeIndicator />
        </div>
      </div>
    </div>
  );
}
