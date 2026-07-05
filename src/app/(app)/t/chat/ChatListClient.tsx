"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { pollChatThreads, deleteChatThread } from "@/lib/data/groups/chat-actions";
import { usePolling } from "@/lib/hooks/usePolling";
import type { ChatThreadView } from "@/lib/types";

export function ChatListClient({
  initial,
  isOwner,
  totalMembers,
}: {
  initial: ChatThreadView[];
  isOwner: boolean;
  totalMembers: number;
}) {
  const showToast = useToast();
  const confirm = useConfirm();
  const [threads, setThreads] = useState<ChatThreadView[]>(initial);
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  usePolling(async () => {
    try {
      setThreads(await pollChatThreads());
    } catch {
      // transient failure — keep current list, retry next tick
    }
  }, 5000);

  async function onDelete(t: ChatThreadView) {
    if (busyId) return;
    if (
      !(await confirm({
        title: "이 대화를 삭제할까요?",
        description: "메시지가 모두 사라지고 되돌릴 수 없어요.",
        confirmLabel: "삭제",
        tone: "warn",
      }))
    )
      return;
    setBusyId(t.id);
    const res = await deleteChatThread(t.id);
    setBusyId(null);
    if (res.ok) {
      setThreads((prev) => prev.filter((x) => x.id !== t.id));
      showToast("대화를 삭제했어요");
    } else {
      showToast(res.error ?? "삭제에 실패했어요.", "error");
    }
  }

  return (
    <>
      {/* header */}
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[21px] font-bold text-ink">채팅</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-banner2 px-3 py-1.5 text-[12px] font-semibold text-[#5b6452]">
            <Icon name="persons" size={15} className="text-sage-deep" />
            {isOwner ? "전체 회원" : "담당회원"} {totalMembers}
          </span>
          {threads.length > 0 ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="tappable rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-sage-deep transition-colors active:scale-95 active:bg-sage-banner2"
            >
              {editing ? "완료" : "편집"}
            </button>
          ) : null}
          {!editing ? (
            <Link
              href="/t/chat/new"
              aria-label="새 메시지"
              className="tappable -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-sage-deep transition-colors active:scale-90 active:bg-sage-banner2"
            >
              <Icon name="write" size={21} />
            </Link>
          ) : null}
        </div>
      </div>

      {/* thread list (live) */}
      {threads.length === 0 ? (
        <EmptyState
          icon="message"
          title="아직 대화가 없어요"
          desc="회원 상세 화면의 메시지 버튼으로 대화를 시작할 수 있어요."
        />
      ) : (
        <div className="flex flex-col">
          {threads.map((t) => {
            const name = t.name || "대화 상대 없음";
            const row = (
              <>
                {t.isTeam && t.team ? (
                  <TeamAvatar team={t.team} size={42} />
                ) : (
                  <Avatar initial={t.initial} tone={t.avatarTone} size={42} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold text-ink">{name}</span>
                    {t.isTeam ? <Badge variant="team">2:1</Badge> : null}
                  </div>
                  <div className="truncate text-[12.5px] font-medium text-muted">{t.preview}</div>
                </div>
                {editing ? (
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    disabled={busyId === t.id}
                    aria-label="대화 삭제"
                    className="tappable flex h-9 w-9 flex-none items-center justify-center rounded-full text-terracotta transition-colors active:scale-90 active:bg-warm-banner disabled:opacity-50"
                  >
                    <Icon name="circle-close" size={22} />
                  </button>
                ) : (
                  <div className="flex flex-none flex-col items-end gap-1">
                    <span className="text-[11px] text-muted3">{t.time}</span>
                    {t.unread > 0 ? (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-surface">
                        {t.unread}
                      </span>
                    ) : null}
                  </div>
                )}
              </>
            );

            const rowClass =
              "flex items-center gap-3 border-b border-ink/[0.06] py-3 last:border-b-0";

            return editing ? (
              <div key={t.id} className={rowClass}>
                {row}
              </div>
            ) : (
              <Link key={t.id} href={`/t/chat/${t.id}`} className={`tappable ${rowClass}`}>
                {row}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
