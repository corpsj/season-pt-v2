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

export function MemberChatClient({
  trainerName,
  initial,
  messages: initialMessages,
  cursor: initialCursor,
}: {
  trainerName: string;
  initial: string;
  sub: string;
  messages: ChatMessageView[];
  cursor: string | null;
}) {
  const showToast = useToast();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [draft, setDraft] = useState("");
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
      showToast(res.error ?? "메시지를 보내지 못했어요");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-none items-center gap-2.5 border-b border-ink/[0.06] px-3 py-2.5">
        <BackButton fallback="/m" />
        <Avatar initial={initial} tone="sage" size={34} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold text-ink">{trainerName} 트레이너</span>
          <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-chip-soft px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
            <Icon name="lock" size={11} />
            담당 트레이너와만 대화
          </span>
        </div>
      </div>

      <Body className="gap-2.5 py-3">
        {/* date chip */}
        <div className="mb-1 flex justify-center">
          <span className="rounded-full bg-chip-soft px-2.5 py-1 text-[11px] font-medium text-muted">오늘</span>
        </div>
        {messages.map((m) => (
          <ChatBubble key={m.id} mine={m.mine} text={m.text} time={m.time} />
        ))}
        <div ref={bottomRef} />
      </Body>

      <ChatInput value={draft} onChange={setDraft} onSend={send} />
    </div>
  );
}
