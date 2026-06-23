"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { startChatWithMember } from "@/lib/data/groups/chat-actions";
import type { ChatMemberPick } from "@/lib/types";

export function NewChatClient({ members }: { members: ChatMemberPick[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function open(memberId: string) {
    if (busy) return;
    setBusy(memberId);
    try {
      const res = await startChatWithMember(memberId);
      if (res.ok && res.threadId) {
        router.push(`/t/chat/${res.threadId}`);
        return;
      }
      showToast(res.error ?? "대화를 시작할 수 없어요.");
    } catch {
      showToast("대화를 시작할 수 없어요.");
    }
    setBusy(null);
  }

  if (!members.length) {
    return (
      <div className="py-12 text-center text-[13px] font-medium text-muted">
        메시지를 보낼 회원이 없어요.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => open(m.id)}
          disabled={busy !== null}
          className="tappable flex items-center gap-3 border-b border-ink/[0.06] py-3 text-left last:border-b-0 active:scale-[0.99] disabled:opacity-50"
        >
          <Avatar initial={m.initial} tone={m.avatarTone} size={42} />
          <span className="truncate text-[14px] font-bold text-ink">{m.name}</span>
        </button>
      ))}
    </div>
  );
}
