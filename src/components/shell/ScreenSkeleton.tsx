/**
 * Instant navigation skeleton. Rendered by route `loading.tsx` files so tapping a
 * tab swaps to this immediately (and enables prefetch of the route shell) instead
 * of freezing on the old screen until the server data resolves.
 */
export function ScreenSkeleton({ tabs = 4 }: { tabs?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden px-[18px] pt-4">
        {/* title */}
        <div className="mb-1.5 h-3.5 w-20 animate-pulse rounded bg-ink/[0.05]" />
        <div className="mb-5 h-6 w-32 animate-pulse rounded-lg bg-ink/[0.07]" />
        {/* hero */}
        <div className="mb-2.5 h-[112px] animate-pulse rounded-[18px] bg-ink/[0.05]" />
        {/* rows */}
        <div className="mb-2.5 h-[62px] animate-pulse rounded-[16px] bg-ink/[0.04]" />
        <div className="mb-2.5 h-[62px] animate-pulse rounded-[16px] bg-ink/[0.04]" />
        <div className="h-[62px] animate-pulse rounded-[16px] bg-ink/[0.04]" />
      </div>
      {/* tab bar placeholder — keeps the bottom nav visually stable during load */}
      <div className="flex flex-none border-t border-ink/[0.07] bg-surface/95 px-3 pt-2.5 pb-[max(24px,var(--safe-b))]">
        {Array.from({ length: tabs }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="h-[22px] w-[22px] animate-pulse rounded-md bg-ink/[0.07]" />
            <div className="h-2 w-7 animate-pulse rounded bg-ink/[0.05]" />
          </div>
        ))}
      </div>
    </div>
  );
}
