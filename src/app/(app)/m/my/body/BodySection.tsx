"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/StatCard";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { logMyBodyComposition, deleteMyBodyComposition } from "@/lib/data/groups/body-actions";
import type { BodyMeasurement } from "@/lib/data/groups/body";

const todayKstDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD

type MetricKey = "weight" | "skeletalMuscle" | "bodyFat";
const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "weight", label: "체중", unit: "kg" },
  { key: "skeletalMuscle", label: "골격근", unit: "kg" },
  { key: "bodyFat", label: "체지방", unit: "%" },
];

/** 이전 대비 변화 라벨(방향만 표시, 좋고 나쁨은 목표에 따라 달라 중립 톤). 없으면 null. */
function delta(cur: number | null, prev: number | null, unit: string): string | null {
  if (cur == null || prev == null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return `±0${unit}`;
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}${unit}`;
}

/** 회원 체성분 — 최근값·추세·이력 + 본인 직접 기록(추가/삭제). */
export function BodySection({ history }: { history: BodyMeasurement[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [, refresh] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ weight: "", skeletalMuscle: "", bodyFat: "", date: todayKstDate() });
  const [metric, setMetric] = useState<MetricKey>("weight");

  const latest = history[0];
  const prev = history[1];

  function reset() {
    setOpen(false);
    setForm({ weight: "", skeletalMuscle: "", bodyFat: "", date: todayKstDate() });
  }
  async function submit() {
    if (busy) return;
    if (!form.weight && !form.skeletalMuscle && !form.bodyFat) return toast("한 가지 이상 입력해주세요", "error");
    setBusy(true);
    try {
      const r = await logMyBodyComposition({
        weight: form.weight,
        skeletalMuscle: form.skeletalMuscle,
        bodyFat: form.bodyFat,
        measuredAt: form.date,
      });
      if (!r.ok) return toast(r.error ?? "저장에 실패했어요", "error");
      toast("체성분을 기록했어요");
      reset();
      refresh(() => router.refresh());
    } catch {
      toast("저장에 실패했어요", "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!(await confirm({ title: "이 기록을 삭제할까요?", description: "되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    if (busy) return;
    setBusy(true);
    try {
      const r = await deleteMyBodyComposition(id);
      if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
      refresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  // 소수 1자리 숫자만 통과시키는 입력 필터
  const numOk = (v: string) => v === "" || /^\d{0,3}(\.\d?)?$/.test(v);

  const m = METRICS.find((x) => x.key === metric)!;
  const trendPts = history
    .filter((b) => b[metric] != null)
    .slice(0, 12)
    .reverse()
    .map((b) => ({ date: b.measuredAt, value: b[metric] as number }));

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="text-[12.5px] font-semibold text-muted5">체성분</span>
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 text-[12px] font-semibold text-surface active:scale-[.97]"
          >
            <Icon name="plus-bold" size={13} />기록
          </button>
        ) : null}
      </div>

      {open ? (
        <Card className="mb-3 p-[16px]">
          <div className="mb-1 text-[12px] font-medium leading-relaxed text-muted">
            집에서 잰 체중도 좋아요 — 아는 값만 입력하면 돼요.
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {METRICS.map((mt) => (
              <div key={mt.key}>
                <div className="mb-1 text-[11.5px] font-semibold text-muted5">{mt.label} ({mt.unit})</div>
                <input
                  value={form[mt.key]}
                  onChange={(e) => numOk(e.target.value) && setForm({ ...form, [mt.key]: e.target.value })}
                  inputMode="decimal"
                  placeholder="—"
                  className="w-full rounded-[11px] border border-ink/[0.12] bg-[#FBF9F5] px-2 py-2.5 text-center text-[14px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Icon name="calendar" size={16} className="flex-none text-muted" />
            <span className="text-[13px] font-semibold text-muted">측정일</span>
            <input
              type="date"
              value={form.date}
              max={todayKstDate()}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="ml-auto rounded-[11px] border border-ink/[0.12] bg-[#FBF9F5] px-3 py-2 text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
            />
          </div>
          <div className="mt-3.5 flex gap-2">
            <button onClick={reset} disabled={busy} className="flex-1 rounded-[13px] border border-ink/[0.12] bg-white py-3 text-[14px] font-semibold text-muted disabled:opacity-50">취소</button>
            <button onClick={submit} disabled={busy} className="flex-[1.6] rounded-[13px] bg-sage py-3 text-[14px] font-semibold text-surface disabled:opacity-50">{busy ? "기록 중…" : "기록하기"}</button>
          </div>
        </Card>
      ) : null}

      {latest ? (
        <Card className="mb-4 px-[15px] py-3.5">
          <div className="flex">
            <BodyStat value={latest.weight} unit="kg" label="체중" d={delta(latest.weight, prev?.weight ?? null, "kg")} />
            <div className="h-9 w-px self-center bg-ink/[0.08]" />
            <BodyStat value={latest.skeletalMuscle} unit="kg" label="골격근" d={delta(latest.skeletalMuscle, prev?.skeletalMuscle ?? null, "kg")} />
            <div className="h-9 w-px self-center bg-ink/[0.08]" />
            <BodyStat value={latest.bodyFat} unit="%" label="체지방" d={delta(latest.bodyFat, prev?.bodyFat ?? null, "%")} />
          </div>
          <div className="mt-1.5 text-center text-[11px] font-medium text-muted">
            최근 측정 {latest.measuredAt.replace(/-/g, ".")}
            {prev ? " · 직전 측정 대비 변화" : ""}
          </div>

          {/* 추세 — 지표 전환 라인 차트 */}
          <div className="mt-4 border-t border-ink/[0.06] pt-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted5">추세</span>
              <div className="flex gap-1">
                {METRICS.map((mt) => (
                  <button
                    key={mt.key}
                    onClick={() => setMetric(mt.key)}
                    className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold transition ${metric === mt.key ? "bg-sage text-surface" : "bg-[#F4F0E8] text-muted"}`}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
            {trendPts.length >= 2 ? (
              <TrendChart pts={trendPts} unit={m.unit} />
            ) : (
              <div className="py-3 text-center text-[11.5px] font-medium text-muted">
                {m.label} 기록이 2회 이상 쌓이면 추세를 보여드려요
              </div>
            )}
          </div>
        </Card>
      ) : !open ? (
        <Card className="mb-4 py-5 text-center text-[12.5px] font-medium text-muted">
          아직 체성분 기록이 없어요. 위 [기록]으로 직접 남기거나 수업 때 선생님이 측정해드려요.
        </Card>
      ) : null}

      {history.length > 0 ? (
        <>
          <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">측정 이력</div>
          <Card className="mb-4 divide-y divide-ink/[0.06] px-4 py-1">
            {history.map((b) => (
              <div key={b.id} className="flex items-center gap-2 py-2.5 text-[13px]">
                <span className="w-[64px] flex-none font-medium text-muted">{b.measuredAt.replace(/-/g, ".").slice(2)}</span>
                <span className="min-w-0 flex-1 font-semibold text-ink">
                  {[b.weight != null ? `${b.weight}kg` : null, b.skeletalMuscle != null ? `골격근 ${b.skeletalMuscle}` : null, b.bodyFat != null ? `체지방 ${b.bodyFat}%` : null].filter(Boolean).join(" · ")}
                </span>
                {b.selfRecorded ? (
                  <>
                    <span className="flex-none rounded-md bg-[#EDF4E3] px-1.5 py-0.5 text-[10px] font-bold text-sage-deep">직접</span>
                    <button onClick={() => remove(b.id)} disabled={busy} className="flex-none text-[#C2BAAD] disabled:opacity-50" aria-label="삭제">
                      <Icon name="close" size={14} />
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
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

/** 라인 차트 — 값 라벨은 겹치지 않게 간격을 두고, 마지막 점은 항상 강조 표시. */
function TrendChart({ pts, unit }: { pts: { date: string; value: number }[]; unit: string }) {
  const W = 320;
  const H = 104;
  const PX = 16; // 좌우 여백
  const PT = 20; // 위 여백(값 라벨 공간)
  const PB = 8;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  const x = (i: number) => (pts.length === 1 ? W / 2 : PX + (i * (W - PX * 2)) / (pts.length - 1));
  const y = (v: number) => (range === 0 ? (H + PT - PB) / 2 : PT + ((max - v) / range) * (H - PT - PB));
  const labelEvery = Math.ceil(pts.length / 6); // 값 라벨 최대 ~6개
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-sage" role="img" aria-label={`추세 ${pts[0].date}부터 ${pts[pts.length - 1].date}까지`}>
        <polyline
          points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => {
          const last = i === pts.length - 1;
          const show = last || i % labelEvery === 0;
          return (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.value)} r={last ? 4 : 2.5} fill={last ? "currentColor" : "#FFFFFF"} stroke="currentColor" strokeWidth="1.5" />
              {show ? (
                <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" fontSize="9.5" fontWeight={last ? 700 : 500} fill={last ? "#5B6452" : "#9A917F"}>
                  {p.value}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-muted4">
        <span>{pts[0].date.slice(5).replace("-", "/")}</span>
        <span className="font-semibold text-sage-deep">{pts[pts.length - 1].date.slice(5).replace("-", "/")} · {pts[pts.length - 1].value}{unit}</span>
      </div>
    </div>
  );
}
