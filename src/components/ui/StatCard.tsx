import { cn } from "@/lib/cn";
import { Card } from "./Card";

export function Stat({
  value,
  label,
  color = "text-ink",
  className,
}: {
  value: React.ReactNode;
  label: string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <div className={cn("serif text-[23px] font-semibold leading-none", color)}>{value}</div>
      <div className="mt-1 text-[11px] font-medium text-muted2">{label}</div>
    </div>
  );
}

/** Card with N stat columns separated by hairline dividers (members header). */
export function StatTriple({
  items,
}: {
  items: { value: React.ReactNode; label: string; color?: string }[];
}) {
  return (
    <Card className="flex px-[15px] py-3.5">
      {items.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center">
          {i > 0 ? <div className="mr-0 h-7 w-px bg-ink/[0.08]" /> : null}
          <Stat value={s.value} label={s.label} color={s.color} className="flex-1" />
        </div>
      ))}
    </Card>
  );
}
