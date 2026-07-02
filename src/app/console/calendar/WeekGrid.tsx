import type { StudioCalendarWeek, WeekClass } from "@/lib/data/groups/console";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const HOUR_PX = 60; // 1분 = 1px

function hourLabel(h: number) {
  if (h === 12) return "오후 12시";
  if (h > 12) return `오후 ${h - 12}시`;
  return `오전 ${h}시`;
}

/** 하루치 세션을 겹침 클러스터별로 레인 분할 — 같은 시간대 여러 강사 수업을 나란히 배치. */
function layoutDay(items: WeekClass[]): { c: WeekClass; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: { c: WeekClass; lane: number; lanes: number }[] = [];
  let cluster: { c: WeekClass; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.c.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.c.endMin); }
      else laneEnds[lane] = item.c.endMin;
      item.lane = lane;
    }
    const lanes = laneEnds.length;
    for (const item of cluster) out.push({ c: item.c, lane: item.lane, lanes });
    cluster = [];
  };
  for (const c of sorted) {
    if (cluster.length && c.startMin >= clusterEnd) flush();
    cluster.push({ c, lane: 0 });
    clusterEnd = Math.max(clusterEnd, c.endMin);
  }
  flush();
  return out;
}

export function WeekGrid({
  week,
  match,
  onOpenDay,
}: {
  week: StudioCalendarWeek;
  match: (c: WeekClass) => boolean;
  onOpenDay: (dateISO: string) => void;
}) {
  const { days, hourStart, hourEnd } = week;
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const bodyH = (hourEnd - hourStart) * HOUR_PX;
  const byDay = new Map<string, WeekClass[]>();
  for (const c of week.classes) {
    if (!match(c)) continue;
    const arr = byDay.get(c.dayISO);
    if (arr) arr.push(c);
    else byDay.set(c.dayISO, [c]);
  }

  return (
    <div className="rounded-[18px] border border-ink/[0.06] bg-white shadow-card">
      {/* 요일 헤더 */}
      <div className="flex border-b border-[rgba(75,59,46,0.08)]">
        <div className="w-[56px] flex-none" />
        {days.map((d) => {
          const color = d.isSunday ? "#C0796A" : d.isSaturday ? "#B89A5E" : "#5B5345";
          return (
            <div key={d.dateISO} className="flex flex-1 flex-col items-center gap-1 py-2.5">
              <span className="text-[11px] font-semibold" style={{ color: d.isSunday ? "#C0796A" : d.isSaturday ? "#B89A5E" : "#9A917F" }}>{WD[d.weekdayIdx]}</span>
              {d.isToday ? (
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ background: "#768C6A" }}>{d.dayNum}</span>
              ) : (
                <span className="text-[15px] font-bold" style={{ color }}>{d.dayNum}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 시간 그리드 */}
      <div className="flex">
        {/* 시간 눈금 */}
        <div className="relative w-[56px] flex-none" style={{ height: bodyH }}>
          {hours.map((h) => (
            <span key={h} className="absolute right-2 text-[10.5px] font-medium text-[#A89F92]" style={{ top: (h - hourStart) * HOUR_PX - 6 }}>{hourLabel(h)}</span>
          ))}
        </div>

        {/* 요일 컬럼 + 세션 블록 */}
        <div className="relative flex-1" style={{ height: bodyH }}>
          {hours.map((h) => (
            <div key={h} className="absolute left-0 right-0 border-t border-[rgba(75,59,46,0.06)]" style={{ top: (h - hourStart) * HOUR_PX }} />
          ))}
          <div className="absolute inset-0 grid grid-cols-7">
            {days.map((d) => {
              const laid = layoutDay(byDay.get(d.dateISO) ?? []);
              return (
                <div key={d.dateISO} className="relative border-l border-[rgba(75,59,46,0.06)]" style={{ background: d.isToday ? "#F7FAF2" : undefined }}>
                  {laid.map(({ c, lane, lanes }) => {
                    const top = c.startMin - hourStart * 60;
                    const height = c.endMin - c.startMin;
                    const cancelled = c.status === "cancelled";
                    return (
                      <button
                        key={c.sessionId}
                        type="button"
                        onClick={() => onOpenDay(c.dayISO)}
                        title="이 날 열기"
                        className="absolute overflow-hidden rounded-[7px] px-1.5 py-1 text-left transition hover:brightness-[1.04]"
                        style={{
                          top: top + 1.5,
                          height: height - 3,
                          left: `calc(${(lane / lanes) * 100}% + 1.5px)`,
                          width: `calc(${100 / lanes}% - 3px)`,
                          background: cancelled ? "#D8D2C6" : c.color,
                          opacity: cancelled ? 0.7 : 1,
                        }}
                      >
                        <div className={`truncate text-[11.5px] font-bold leading-tight text-white ${cancelled ? "line-through" : ""}`}>
                          {c.member}{c.isTeam ? " 2:1" : ""}
                        </div>
                        {height >= 34 ? (
                          <div className="truncate text-[10px] font-medium leading-tight text-white/85">{c.sub}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
