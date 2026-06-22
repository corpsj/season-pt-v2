"use client";
import { useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { ChatInput } from "@/components/ui/ChatInput";
import { Icon } from "@/components/ui/icon";
import { getMemberChatRoom } from "@/lib/data";

export default function MemberChatPage() {
  const room = getMemberChatRoom();
  const [messages, setMessages] = useState(room.messages);
  const [draft, setDraft] = useState("");

  function send() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: String(prev.length + 1), mine: true, text }]);
    setDraft("");
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-none items-center gap-2.5 border-b border-ink/[0.06] px-3 py-2.5">
        <BackButton fallback="/m" />
        <Avatar initial={room.initial} tone="sage" size={34} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold text-ink">{room.trainerName} 트레이너</span>
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
      </Body>

      <ChatInput value={draft} onChange={setDraft} onSend={send} />
    </div>
  );
}
