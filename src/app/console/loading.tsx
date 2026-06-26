/** 콘솔 섹션 전환 시 로딩 스켈레톤(사이드바는 레이아웃이 유지). 빈 화면/이전 콘텐츠 잔상 방지. */
export default function ConsoleLoading() {
  return (
    <div className="px-7 py-6">
      <div className="mb-6 h-8 w-52 animate-pulse rounded-[12px] bg-[rgba(75,59,46,0.06)]" />
      <div className="grid grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[18px] bg-[rgba(75,59,46,0.05)]" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-[18px] bg-[rgba(75,59,46,0.05)]" />
        ))}
      </div>
    </div>
  );
}
