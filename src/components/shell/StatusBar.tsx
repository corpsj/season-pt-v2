/** iOS-style status bar — desktop preview chrome only (hidden on real mobile). */
export function StatusBar() {
  return (
    <div className="hidden h-11 flex-none items-center justify-between px-7 pt-2 text-ink sm:flex">
      <span className="text-[15px] font-semibold tracking-tight">9:41</span>
      <div className="flex items-center gap-1.5">
        {/* cellular */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        {/* wifi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
          <path d="M8 2.2c2.6 0 5 1 6.8 2.7l-1.4 1.5A7.7 7.7 0 0 0 8 4.3 7.7 7.7 0 0 0 2.6 6.4L1.2 4.9A9.8 9.8 0 0 1 8 2.2Z" />
          <path d="M8 6c1.4 0 2.7.5 3.7 1.5l-1.5 1.5A3 3 0 0 0 8 8.1c-.8 0-1.6.3-2.2.9L4.3 7.5A5.2 5.2 0 0 1 8 6Z" />
          <circle cx="8" cy="10.6" r="1.4" />
        </svg>
        {/* battery */}
        <svg width="26" height="13" viewBox="0 0 26 13" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="22" height="12" rx="3.5" stroke="currentColor" opacity="0.35" />
          <rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" />
          <rect x="24" y="4" width="2" height="5" rx="1" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}
