/** Bottom home indicator bar (desktop preview chrome). */
export function HomeIndicator() {
  return (
    <div className="pointer-events-none hidden h-6 flex-none items-end justify-center sm:flex">
      <div className="mb-2 h-[5px] w-[120px] rounded-full bg-ink/25" />
    </div>
  );
}
