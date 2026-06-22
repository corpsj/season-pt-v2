export function Stepper({
  value,
  unit,
  onDec,
  onInc,
}: {
  value: number;
  unit: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-between rounded-[10px] bg-stepper-bg px-[11px] py-[7px]">
      <button type="button" aria-label="감소" onClick={onDec} className="tappable flex w-5 justify-center text-chevron">
        <span className="text-[18px] font-semibold leading-none">–</span>
      </button>
      <span className="text-[14px] font-bold text-ink">
        {value}
        <span className="text-[11px] font-medium text-muted"> {unit}</span>
      </span>
      <button type="button" aria-label="증가" onClick={onInc} className="tappable flex w-5 justify-center text-sage-deep">
        <span className="text-[18px] font-semibold leading-none">+</span>
      </button>
    </div>
  );
}
