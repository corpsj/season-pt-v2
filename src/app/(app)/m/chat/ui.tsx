"use client";
import { useEffect, useRef, useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { ChatInput } from "@/components/ui/ChatInput";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { sendMemberChat, pollMemberMessages } from "@/lib/data/groups/member-actions";
import { mergeMessages, latestCursor, TEMP_PREFIX } from "@/lib/chat/merge";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatMessageView } from "@/lib/types";

/** KST calendar day (YYYY-MM-DD) for a message; optimistic (no ts) folds into today. */
function kstDayKey(iso: string | undefined, todayKey: string): string {
  if (!iso) return todayKey;
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
function dayChipLabel(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return "오늘";
  if (key === yesterdayKey) return "어제";
  const [, mo, d] = key.split("-");
  return `${Number(mo)}월 ${Number(d)}일`;
}

export function MemberChatClient({
  trainerName,
  initial,
  isTeam,
  messages: initialMessages,
  cursor: initialCursor,
  truncated,
  initialDraft,
}: {
  trainerName: string;
  initial: string;
  sub: string;
  isTeam: boolean;
  messages: ChatMessageView[];
  cursor: string | null;
  truncated?: boolean;
  initialDraft?: string;
}) {
  const showToast = useToast();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const cursorRef = useRef<string | null>(
    latestCursor(initialMessages, initialCursor)
  );
  const tempSeq = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }

  // Scroll to the newest message after the DOM commits (new polls, sends, and initial open).
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  usePolling(async () => {
    let incoming: ChatMessageView[] = [];
    try {
      incoming = await pollMemberMessages(cursorRef.current);
    } catch {
      return;
    }
    if (!incoming.length) return;
    setMessages((prev) => {
      const merged = mergeMessages(prev, incoming);
      cursorRef.current = latestCursor(merged, cursorRef.current);
      return merged;
    });
  }, 3000);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    const tempId = `${TEMP_PREFIX}${tempSeq.current++}`;
    setMessages((prev) => [...prev, { id: tempId, mine: true, text }]);
    setDraft("");
    try {
      const res = await sendMemberChat(text);
      if (res.ok && res.message) {
        const real = res.message;
        setMessages((prev) => {
          const merged = mergeMessages(prev, [real]);
          cursorRef.current = latestCursor(merged, cursorRef.current);
          return merged;
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        showToast(res.error ?? "메시지를 보내지 못했어요", "error");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast("메시지를 보내지 못했어요", "error");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-none items-center gap-2.5 border-b border-ink/[0.06] px-3 py-2.5">
        <BackButton fallback="/m" />
        <Avatar initial={initial} tone="sage" size={34} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold text-ink">{trainerName} 선생님</span>
          <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-chip-soft px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
            <Icon name={isTeam ? "persons" : "lock"} size={11} />
            {isTeam ? "2:1 팀 채팅" : "담당 선생님과만 대화"}
          </span>
        </div>
      </div>

      <Body className="gap-2.5 py-3">
        {truncated ? (
          <div className="mx-auto mb-1 rounded-full bg-chip-soft px-3 py-1 text-[11px] font-medium text-muted2">
            최근 100개 메시지만 표시돼요
          </div>
        ) : null}
        {(() => {
          const todayKey = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
          const yesterdayKey = new Date(Date.now() - 86400000 + 9 * 3600000).toISOString().slice(0, 10);
          let prevKey = "";
          const rows: React.ReactNode[] = [];
          for (const m of messages) {
            const key = kstDayKey(m.createdAt, todayKey);
            if (key !== prevKey) {
              prevKey = key;
              rows.push(
                <div key={`day-${key}`} className="mb-1 flex justify-center">
                  <span className="rounded-full bg-chip-soft px-2.5 py-1 text-[11px] font-medium text-muted">
                    {dayChipLabel(key, todayKey, yesterdayKey)}
                  </span>
                </div>
              );
            }
            rows.push(<ChatBubble key={m.id} mine={m.mine} sender={m.sender} text={m.text} time={m.time} />);
          }
          return rows;
        })()}
        <div ref={bottomRef} />
      </Body>

      <ChatInput value={draft} onChange={setDraft} onSend={send} />
    </div>
  );
}
