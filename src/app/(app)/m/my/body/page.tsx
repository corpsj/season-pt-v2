import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/StatCard";
import { BarChart } from "@/components/ui/BarChart";
import { Icon } from "@/components/ui/icon";
import { getMyFiles } from "@/lib/data/groups/member-files";
import { getMyBodyHistory, type BodyMeasurement } from "@/lib/data/groups/body";
import { MyPhotos } from "./MyPhotos";

/** 이전 대비 변화 라벨(방향만 표시, 좋고 나쁨은 목표에 따라 달라 중립 톤). 없으면 null. */
function delta(cur: number | null, prev: number | null, unit: string): string | null {
  if (cur == null || prev == null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return `±0${unit}`;
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}${unit}`;
}

/** 체중 추세 막대 — 최근 ≤10건(오래된→최신), min~max 정규화. */
function weightBars(history: BodyMeasurement[]) {
  const pts = history.filter((b) => b.weight != null).slice(0, 10).reverse();
  if (pts.length < 2) return null;
  const ws = pts.map((p) => p.weight as number);
  const min = Math.min(...ws);
  const max = Math.max(...ws);
  const range = max - min;
  const MIN_PX = 14;
  const MAX_PX = 64;
  return pts.map((p, i) => ({
    label: p.measuredAt.slice(5).replace("-", "/"),
    valuePx: range === 0 ? (MIN_PX + MAX_PX) / 2 : MIN_PX + ((p.weight as number) - min) / range * (MAX_PX - MIN_PX),
    emphasized: i === pts.length - 1,
  }));
}

export default async function MemberBodyPage() {
  const [history, photos, inbodies] = await Promise.all([
    getMyBodyHistory(),
    getMyFiles("photo"),
    getMyFiles("inbody"),
  ]);

  const latest = history[0];
  const prev = history[1];
  const bars = weightBars(history);
  const dW = delta(latest?.weight ?? null, prev?.weight ?? null, "kg");
  const dSm = delta(latest?.skeletalMuscle ?? null, prev?.skeletalMuscle ?? null, "kg");
  const dBf = delta(latest?.bodyFat ?? null, prev?.bodyFat ?? null, "%");

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">체형 기록</span>
        </div>

        {/* 체성분 */}
        {latest ? (
          <>
            <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">체성분</div>
            <Card className="mb-4 px-[15px] py-3.5">
              <div className="flex">
                <BodyStat value={latest.weight} unit="kg" label="체중" d={dW} />
                <div className="h-9 w-px self-center bg-ink/[0.08]" />
                <BodyStat value={latest.skeletalMuscle} unit="kg" label="골격근" d={dSm} />
                <div className="h-9 w-px self-center bg-ink/[0.08]" />
                <BodyStat value={latest.bodyFat} unit="%" label="체지방" d={dBf} />
              </div>
              <div className="mt-1.5 text-center text-[11px] font-medium text-muted">
                최근 측정 {latest.measuredAt.replace(/-/g, ".")}
                {prev ? " · 직전 측정 대비 변화" : ""}
              </div>

              {bars ? (
                <div className="mt-4 border-t border-ink/[0.06] pt-3.5">
                  <div className="mb-2.5 text-[11px] font-semibold text-muted5">체중 추세</div>
                  <BarChart bars={bars} />
                </div>
              ) : null}
            </Card>

            {history.length > 1 ? (
              <>
                <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">측정 이력</div>
                <Card className="mb-4 divide-y divide-ink/[0.06] px-4 py-1">
                  {history.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 py-2.5 text-[13px]">
                      <span className="w-[64px] flex-none font-medium text-muted">{b.measuredAt.replace(/-/g, ".").slice(2)}</span>
                      <span className="flex-1 font-semibold text-ink">
                        {[b.weight != null ? `${b.weight}kg` : null, b.skeletalMuscle != null ? `골격근 ${b.skeletalMuscle}` : null, b.bodyFat != null ? `체지방 ${b.bodyFat}%` : null].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {/* 진행 사진 — 회원 본인 업로드/삭제 */}
        <MyPhotos initial={photos} />

        {/* 인바디 — 강사가 남긴 기록(읽기 전용) */}
        <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">인바디</div>
        {inbodies.length === 0 ? (
          <Card className="py-4 text-center text-[12.5px] font-medium text-muted">아직 인바디 결과가 없어요</Card>
        ) : (
          <Card className="divide-y divide-ink/[0.06] px-4 py-1">
            {inbodies.map((f) => (
              <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-3">
                <Icon name="document-text" size={16} className="flex-none text-sage" />
                <span className="flex-1 truncate text-[13px] font-semibold text-ink">인바디 · {f.takenAt.replace(/-/g, ".")}</span>
                <Icon name="chevron-right" size={16} className="flex-none text-muted" />
              </a>
            ))}
          </Card>
        )}
        <div className="h-2" />
      </Body>
    </div>
  );
}

function BodyStat({ value, unit, label, d }: { value: number | null; unit: string; label: string; d: string | null }) {
  return (
    <div className="flex-1 text-center">
      <Stat value={value != null ? value : "–"} label={`${label} (${unit})`} />
      {d ? <div className="mt-1 text-[11px] font-semibold text-muted2">{d}</div> : null}
    </div>
  );
}
