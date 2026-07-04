import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/**
 * Controlled chat composer. State lives in the client parent (value/onChange/onSend).
 *
 * 입력부는 `<input>`이 아니라 `contentEditable` div다 — iOS는 폼 컨트롤(input/textarea)에
 * 키보드 위 '이전·다음·완료' 보조 툴바(form assistant)를 강제로 붙이는데, contenteditable에는
 * 붙이지 않기 때문. 값 동기화는 캐럿 점프를 막도록 "DOM 텍스트 ≠ value일 때만" 반영한다
 * (타이핑 중에는 onInput이 먼저 DOM을 바꾸므로 value와 같아져 재기록이 안 일어남).
 */
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
  const ref = useRef<HTMLDivElement>(null);

  // 외부에서 값이 바뀐 경우(초기 draft, 전송 후 "")에만 DOM에 반영 → 타이핑 캐럿 점프 방지.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  return (
    <div
      data-chat-composer
      className="flex flex-none items-end gap-2 border-t border-ink/[0.06] px-3 pt-2 pb-[max(34px,calc(var(--safe-b)_+_20px))]"
    >
      {/* 첨부(+) 버튼은 기능이 생기면 복원 — 동작 없는 버튼은 신뢰를 깎는다 */}
      <div className="relative min-w-0 flex-1">
        <div
          ref={ref}
          role="textbox"
          aria-label="메시지 입력"
          aria-multiline="false"
          contentEditable
          suppressContentEditableWarning
          inputMode="text"
          enterKeyHint="send"
          onInput={(e) => onChange(e.currentTarget.textContent ?? "")}
          onKeyDown={(e) => {
            // Enter=전송. 줄바꿈은 막고(shift 제외), 한글 조합 중(isComposing)에는 전송하지 않는다.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (ready && !e.nativeEvent.isComposing) onSend();
            }
          }}
          onPaste={(e) => {
            // 리치 텍스트가 아니라 평문만 삽입(서식·개행 유입 방지)
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
            document.execCommand("insertText", false, text);
          }}
          className="max-h-[120px] min-h-10 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-[20px] border border-ink/[0.12] bg-card px-4 py-[9px] text-[13.5px] font-medium leading-5 text-ink outline-none focus:border-sage-line"
        />
        {value.length === 0 && (
          <span className="pointer-events-none absolute left-4 top-[9px] text-[13.5px] font-medium leading-5 text-placeholder">
            메시지 입력
          </span>
        )}
      </div>
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
