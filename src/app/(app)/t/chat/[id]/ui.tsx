"use client";
import { useEffect, useRef, useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { ChatInput } from "@/components/ui/ChatInput";
import { useToast } from "@/components/ui/Toast";
import { sendChat, pollTrainerMessages } from "@/lib/data/groups/chat-actions";
import { mergeMessages, latestCursor, TEMP_PREFIX } from "@/lib/chat/merge";
import { dayChipLabel, kstDayKey, type ChatDayKeys } from "@/lib/chat/day-labels";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatMessageView, ChatRoomView } from "@/lib/types";

export function ChatRoomClient({ room, dayKeys }: { room: ChatRoomView; dayKeys: ChatDayKeys }) {
  const showToast = useToast();
  const [messages, setMessages] = useState<ChatMessageView[]>(room.messages);
  const [draft, setDraft] = useState("");
  const cursorRef = useRef<string | null>(
    latestCursor(room.messages, room.cursor ?? null)
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

  // iOS 키보드가 열리면(KeyboardInsets가 spt:kbopen 발행) 셸이 줄며 최신 메시지가 가려지므로 다시 하단으로.
  useEffect(() => {
    const onKb = () => requestAnimationFrame(scrollToBottom);
    window.addEventListener("spt:kbopen", onKb);
    return () => window.removeEventListener("spt:kbopen", onKb);
  }, []);

  usePolling(async () => {
    let incoming: ChatMessageView[] = [];
    try {
      incoming = await pollTrainerMessages(room.threadId, cursorRef.current);
    } catch {
      return; // transient failure — retry next tick
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
      const res = await sendChat(room.threadId, text);
      if (res.ok && res.message) {
        const real = res.message;
        setMessages((prev) => {
          const merged = mergeMessages(prev, [real]);
          cursorRef.current = latestCursor(merged, cursorRef.current);
          return merged;
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        showToast(res.error ?? "전송에 실패했어요.", "error");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast("전송에 실패했어요.", "error");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-none items-center gap-3 border-b border-ink/[0.06] px-[18px] py-2.5">
        <BackButton fallback="/t/chat" />
        {room.isTeam && room.team ? (
          <TeamAvatar team={room.team} size={34} />
        ) : (
          <Avatar initial={room.initial} tone={room.avatarTone} size={34} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-ink">{room.name}</span>
            {room.isTeam ? <Badge variant="team">2:1</Badge> : null}
          </div>
          <div className="truncate text-[11.5px] font-medium text-muted">{room.sub}</div>
        </div>
      </div>

      {/* messages */}
      <Body className="gap-2.5 py-3.5">
        {room.isTeam ? (
          <div className="mx-auto mb-1 rounded-full bg-chip-soft px-3 py-1 text-[11px] font-medium text-muted2">
            2:1 팀 채팅이에요
          </div>
        ) : null}
        {room.truncated ? (
          <div className="mx-auto mb-1 rounded-full bg-chip-soft px-3 py-1 text-[11px] font-medium text-muted2">
            최근 100개 메시지만 표시돼요
          </div>
        ) : null}
        {(() => {
          let prevKey = "";
          const rows: React.ReactNode[] = [];
          for (const m of messages) {
            const key = kstDayKey(m.createdAt, dayKeys.todayKey);
            if (key !== prevKey) {
              prevKey = key;
              rows.push(
                <div key={`day-${key}`} className="mx-auto mb-1 rounded-full bg-chip-soft px-3 py-1 text-[11px] font-medium text-muted2">
                  {dayChipLabel(key, dayKeys)}
                </div>
              );
            }
            rows.push(
              <ChatBubble
                key={m.id}
                mine={m.mine}
                sender={room.isTeam && !m.mine ? m.sender : undefined}
                text={m.text}
                time={m.time}
              />
            );
          }
          return rows;
        })()}
        <div ref={bottomRef} />
      </Body>

      {/* composer */}
      <ChatInput value={draft} onChange={setDraft} onSend={send} />
    </div>
  );
}
