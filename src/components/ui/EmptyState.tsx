import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  icon,
  title,
  desc,
  tone = "soft",
}: {
  icon: IconName;
  title: string;
  desc?: string;
  tone?: "soft" | "green";
}) {
  return (
    <div className="flex flex-col items-center justify-center px-0 py-7 text-center">
      <div
        className={cn(
          "mb-3.5 flex h-[68px] w-[68px] items-center justify-center rounded-full",
          tone === "green" ? "bg-sage-banner2" : "bg-chip-soft"
        )}
      >
        <Icon name={icon} size={28} className={tone === "green" ? "text-sage-leaf" : "text-placeholder"} />
      </div>
      <div className="text-[15px] font-bold text-ink">{title}</div>
      {desc ? <p className="mt-1.5 max-w-[220px] text-[12.5px] leading-[1.6] text-muted">{desc}</p> : null}
    </div>
  );
}
