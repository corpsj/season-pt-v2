import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * iOS 키보드 위 보조 툴바(‹ 이전 · 다음 › · 완료) 없는 자유 텍스트 입력.
 *
 * iOS는 폼 컨트롤(`<input>`/`<textarea>`)에는 그 툴바를 강제로 붙이지만 `contentEditable`
 * 요소에는 붙이지 않는다. 그래서 이름·메모·검색 같은 **자유 텍스트** 입력을 이 컴포넌트로
 * 바꾼다. 숫자(전화·금액)·날짜·시간·드롭다운·비밀번호·자동완성 필드에는 쓰지 말 것 —
 * contenteditable은 숫자패드/피커/자동완성/마스킹을 못 하므로 기능이 깨진다.
 *
 * 값 동기화는 "DOM 텍스트 ≠ value일 때만" 반영해 타이핑 캐럿 점프를 막는다(타이핑 중엔
 * onInput이 먼저 DOM을 바꿔 value와 같아지므로 재기록이 안 일어남). placeholder는 value가
 * 비었을 때만 붙는 data-empty + ::before(globals.css)로 렌더 — 패딩을 상속해 정렬이 정확하다.
 */
export function PlainTextInput({
  value,
  onChange,
  placeholder,
  className,
  wrapperClassName,
  maxLength,
  multiline = false,
  disabled = false,
  autoFocus = false,
  ariaLabel,
  enterKeyHint,
  autoCapitalize,
  spellCheck,
  inputMode,
  onEnter,
  onBlur,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** editable 요소에 적용 — 기존 <input>/<textarea> className을 그대로 옮기면 된다. */
  className?: string;
  /** relative 래퍼에 적용(너비·정렬 등이 래퍼에 필요할 때). */
  wrapperClassName?: string;
  maxLength?: number;
  multiline?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  autoCapitalize?: string;
  spellCheck?: boolean;
  inputMode?: "text" | "search" | "none";
  /** 한 줄 모드에서 Enter를 눌렀을 때(조합 중 제외). 줄바꿈은 항상 막힌다. */
  onEnter?: () => void;
  onBlur?: () => void;
  onFocus?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 외부 value 변화만 DOM에 반영(초기값·전송/초기화 후 등). 타이핑은 이미 DOM에 반영돼 있음.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const emit = (el: HTMLElement) => {
    let text = el.textContent ?? "";
    if (!multiline) text = text.replace(/\n/g, "");
    if (maxLength != null && text.length > maxLength) {
      text = text.slice(0, maxLength);
      el.textContent = text;
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false); // 캐럿을 끝으로
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    onChange(text);
  };

  return (
    <div className={cn("relative min-w-0", wrapperClassName)}>
      <div
        ref={ref}
        role="textbox"
        aria-label={ariaLabel ?? placeholder}
        aria-multiline={multiline}
        contentEditable={!disabled}
        suppressContentEditableWarning
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        autoCapitalize={autoCapitalize}
        spellCheck={spellCheck}
        data-ph={placeholder}
        data-empty={value.length === 0 ? "" : undefined}
        onInput={(e) => emit(e.currentTarget)}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (multiline) {
            // 줄바꿈은 <br> 대신 '\n' 텍스트로 넣어 textContent가 그대로 개행을 담게 한다.
            if (!e.nativeEvent.isComposing) {
              e.preventDefault();
              document.execCommand("insertText", false, "\n");
            }
          } else {
            e.preventDefault(); // 한 줄: 줄바꿈 금지
            if (!e.nativeEvent.isComposing) onEnter?.();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          let text = e.clipboardData.getData("text/plain");
          if (!multiline) text = text.replace(/\s+/g, " "); // 한 줄: 개행·연속공백 평문화
          document.execCommand("insertText", false, text);
        }}
        className={cn(
          multiline ? "whitespace-pre-wrap break-words" : "overflow-hidden whitespace-nowrap",
          "outline-none",
          className
        )}
      />
    </div>
  );
}
