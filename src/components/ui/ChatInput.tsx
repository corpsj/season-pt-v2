import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** Controlled chat composer (.cinput + .sendbtn). State lives in the client parent. */
export function ChatInput({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const ready = value.trim().length > 0;
  return (
    <div className="flex flex-none items-center gap-2 border-t border-ink/[0.06] px-3 pt-2 pb-[max(12px,var(--safe-b))]">
      <button
        type="button"
        aria-label="첨부"
        className="tappable flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-ink/[0.08] bg-card text-[#9a917f]"
      >
        <Icon name="plus" size={18} />
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) onSend();
        }}
        placeholder="메시지 입력"
        className="h-10 min-w-0 flex-1 rounded-[20px] border border-ink/[0.12] bg-card px-4 text-[13.5px] font-medium text-ink outline-none placeholder:text-placeholder focus:border-sage-line"
      />
      <button
        type="button"
        aria-label="전송"
        onClick={() => ready && onSend()}
        disabled={!ready}
        className={cn(
          "tappable flex h-10 w-10 flex-none items-center justify-center rounded-full",
          ready ? "bg-sage text-surface" : "bg-disabled-send text-placeholder"
        )}
      >
        <Icon name="send" size={18} />
      </button>
    </div>
  );
}
