"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { ConsoleModal } from "@/components/console/ui";
import { usePolling } from "@/lib/hooks/usePolling";
import { mergeMessages, latestCursor, TEMP_PREFIX } from "@/lib/chat/merge";
import { sendChat, pollTrainerMessages, pollChatThreads, startChatWithMember } from "@/lib/data/groups/chat-actions";
import { loadConsoleRoom } from "@/lib/data/groups/console-actions";
import type { ChatThreadView, ChatRoomView, ChatMessageView, ChatMemberPick } from "@/lib/types";

export function MessagesClient({
  initialThreads,
  initialRoom,
  members,
}: {
  initialThreads: ChatThreadView[];
  initialRoom: ChatRoomView | null;
  members: ChatMemberPick[];
}) {
  const toast = useToast();
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoom?.threadId ?? null);
  const [room, setRoom] = useState<ChatRoomView | null>(initialRoom);
  const [messages, setMessages] = useState<ChatMessageView[]>(initialRoom?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [q, setQ] = useState("");
  const cursorRef = useRef<string | null>(latestCursor(initialRoom?.messages ?? [], initialRoom?.cursor ?? null));
  const tempSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  usePolling(async () => {
    try {
      setThreads(await pollChatThreads());
    } catch {
      /* keep prior */
    }
  }, 5000);

  usePolling(async () => {
    if (!selectedId) return;
    let incoming: ChatMessageView[] = [];
    try {
      incoming = await pollTrainerMessages(selectedId, cursorRef.current);
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

  async function open(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setMessages([]);
    setRoom(null);
    const r = await loadConsoleRoom(id);
    if (r) {
      setRoom(r);
      setMessages(r.messages);
      cursorRef.current = latestCursor(r.messages, r.cursor ?? null);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || !selectedId) return;
    const tempId = `${TEMP_PREFIX}${tempSeq.current++}`;
    setMessages((prev) => [...prev, { id: tempId, mine: true, text }]);
    setDraft("");
    try {
      const res = await sendChat(selectedId, text);
      if (res.ok && res.message) {
        const real = res.message;
        setMessages((prev) => {
          const merged = mergeMessages(prev, [real]);
          cursorRef.current = latestCursor(merged, cursorRef.current);
          return merged;
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast(res.error ?? "전송에 실패했어요");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast("전송에 실패했어요");
    }
  }

  async function startWith(memberId: string) {
    const r = await startChatWithMember(memberId);
    if (r.ok && r.threadId) {
      setNewOpen(false);
      setQ("");
      await open(r.threadId);
      try {
        setThreads(await pollChatThreads());
      } catch {
        /* ignore */
      }
    } else {
      toast(r.error ?? "대화를 시작할 수 없어요");
    }
  }

  const pickList = members.filter((m) => q.trim() === "" || m.name.includes(q.trim())).slice(0, 50);

  return (
    <>
      {/* thread list */}
      <div className="flex w-[300px] flex-none flex-col border-r border-[rgba(75,59,46,0.08)] bg-white">
        <div className="flex items-center justify-between border-b border-[rgba(75,59,46,0.07)] px-[18px] py-3">
          <span className="text-[14px] font-bold text-ink">대화</span>
          <button onClick={() => setNewOpen(true)} aria-label="새 대화" className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#EDF4E3] text-sage-deep transition hover:brightness-95"><Icon name="write" size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map((t) => {
            const on = t.id === selectedId;
            return (
              <button key={t.id} onClick={() => open(t.id)} className={`flex w-full items-center gap-3 border-b border-[rgba(75,59,46,0.05)] px-[18px] py-3.5 text-left transition-colors ${on ? "bg-[#EDF4E3]" : "hover:bg-[#FBFAF7]"}`}>
                {t.isTeam && t.team ? <TeamAvatar team={t.team} size={44} /> : <Avatar initial={t.initial} tone={t.avatarTone} size={44} fontSize={15} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-bold text-ink">{t.name}</span>
                    <span className="ml-auto flex-none text-[10.5px] font-medium text-[#A89F92]">{t.time}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#9A917F]">{t.preview}</span>
                    {t.unread > 0 ? <span className="flex h-[17px] min-w-[17px] flex-none items-center justify-center rounded-full bg-terracotta px-1.5 text-[10px] font-bold text-white">{t.unread}</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
          {threads.length === 0 ? <div className="px-5 py-10 text-center text-[12.5px] font-medium text-[#A89F92]">대화가 없어요</div> : null}
        </div>
      </div>

      {/* room */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#F4EFE6]">
        {room ? (
          <>
            <div className="flex flex-none items-center gap-3 border-b border-[rgba(75,59,46,0.07)] bg-white px-[22px] py-[15px]">
              {room.isTeam && room.team ? <TeamAvatar team={room.team} size={40} /> : <Avatar initial={room.initial} tone={room.avatarTone} size={40} fontSize={15} />}
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-ink">{room.name}</div>
                <div className="truncate text-[11px] font-medium text-[#9A917F]">{room.sub}</div>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
              {room.truncated ? (
                <div className="mx-auto mb-3 w-fit rounded-full bg-[#EDF4E3] px-3 py-1 text-[11px] font-medium text-[#6B7A5C]">
                  최근 100개 메시지만 표시돼요
                </div>
              ) : null}
              {messages.map((m) => (
                <div key={m.id} className={`mb-2.5 flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
                  {m.sender && !m.mine ? <span className="mb-0.5 px-1 text-[10.5px] font-medium text-[#9A917F]">{m.sender}</span> : null}
                  <div className={`max-w-[72%] px-3.5 py-2.5 text-[13.5px] font-medium leading-relaxed ${m.mine ? "rounded-[16px] rounded-br-[4px] bg-sage text-white" : "rounded-[16px] rounded-bl-[4px] border border-[rgba(75,59,46,0.06)] bg-white text-ink"}`}>
                    {m.text}
                  </div>
                  {m.time ? <span className="mt-0.5 px-1 text-[10px] font-medium text-[#B3AA9C]">{m.time}</span> : null}
                </div>
              ))}
            </div>
            <div className="flex flex-none items-center gap-2.5 border-t border-[rgba(75,59,46,0.07)] bg-white px-5 py-3.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="메시지를 입력하세요"
                className="flex-1 rounded-[13px] bg-[#F4EFE6] px-4 py-3 text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
              />
              <button onClick={send} aria-label="전송" className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-sage text-white transition hover:brightness-105 active:scale-95"><Icon name="send" size={18} /></button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[14px] font-medium text-[#A89F92]">{selectedId ? "불러오는 중…" : "대화를 선택하세요"}</div>
        )}
      </div>

      {/* new chat */}
      {newOpen ? (
        <ConsoleModal title="새 대화" onClose={() => { setNewOpen(false); setQ(""); }}>
          <div className="mb-2 flex items-center gap-2 rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-[#FBF9F5] px-3 py-2.5">
            <Icon name="search" size={16} className="text-[#A89F92]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회원 이름 검색" className="w-full bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-[12px] border border-[rgba(75,59,46,0.08)]">
            {pickList.map((m) => (
              <button key={m.id} onClick={() => startWith(m.id)} className="flex w-full items-center gap-2.5 border-b border-[rgba(75,59,46,0.05)] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[#FBFAF7]">
                <Avatar initial={m.initial} tone={m.avatarTone} size={34} />
                <span className="flex-1 text-[13.5px] font-semibold text-ink">{m.name}</span>
                <Icon name="chevron-right" size={15} className="text-[#C2BAAD]" />
              </button>
            ))}
            {pickList.length === 0 ? <div className="px-3 py-6 text-center text-[12.5px] font-medium text-[#A89F92]">회원이 없어요</div> : null}
          </div>
        </ConsoleModal>
      ) : null}
    </>
  );
}
