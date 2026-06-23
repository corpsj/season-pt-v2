"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { startChatWithMember } from "@/lib/data/groups/chat-actions";

export function MessageMemberButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
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
    setBusy(false);
  }

  return (
    <OutlineButton icon="message" onClick={go} disabled={busy}>
      메시지
    </OutlineButton>
  );
}
