"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { pollChatThreads } from "@/lib/data/groups/chat-actions";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatThreadView } from "@/lib/types";

export function ChatListClient({ initial }: { initial: ChatThreadView[] }) {
  const [threads, setThreads] = useState<ChatThreadView[]>(initial);

  usePolling(async () => {
    try {
      setThreads(await pollChatThreads());
    } catch {
      // transient failure — keep current list, retry next tick
    }
  }, 5000);

  if (threads.length === 0) {
    return <EmptyState icon="message" title="아직 대화가 없어요" desc="회원 상세 화면의 메시지 버튼으로 대화를 시작할 수 있어요." />;
  }

  return (
    <div className="flex flex-col">
      {threads.map((t) => (
        <Link
          key={t.id}
          href={`/t/chat/${t.id}`}
          className="tappable flex items-center gap-3 border-b border-ink/[0.06] py-3 last:border-b-0"
        >
          {t.isTeam && t.team ? (
            <TeamAvatar team={t.team} size={42} />
          ) : (
            <Avatar initial={t.initial} tone={t.avatarTone} size={42} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-bold text-ink">{t.name}</span>
              {t.isTeam ? <Badge variant="team">2:1</Badge> : null}
            </div>
            <div className="truncate text-[12.5px] font-medium text-muted">{t.preview}</div>
          </div>
          <div className="flex flex-none flex-col items-end gap-1">
            <span className="text-[11px] text-muted3">{t.time}</span>
            {t.unread > 0 ? (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-surface">
                {t.unread}
              </span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
