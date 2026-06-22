import { cn } from "@/lib/cn";

export function ChatBubble({
  mine,
  sender,
  text,
  time,
}: {
  mine: boolean;
  sender?: string;
  text: string;
  time?: string;
}) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {sender && !mine ? <span className="mb-1 ml-1 text-[11px] font-medium text-muted">{sender}</span> : null}
      <div
        className={cn(
          "max-w-[78%] px-3.5 py-2.5 text-[13.5px] font-medium leading-[1.5]",
          mine
            ? "rounded-[16px_16px_4px_16px] bg-sage text-surface"
            : "rounded-[4px_16px_16px_16px] bg-card text-ink shadow-[0_1px_2px_rgba(75,59,46,0.04)]"
        )}
      >
        {text}
      </div>
      {time ? <span className="mt-1 px-1 text-[10px] text-placeholder">{time}</span> : null}
    </div>
  );
}
