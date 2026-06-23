import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { getMessageableMembers } from "@/lib/data/groups/chat";
import { NewChatClient } from "./ui";

export default async function NewChatPage() {
  const members = await getMessageableMembers();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-ink/[0.06] px-[18px] py-2.5">
        <BackButton fallback="/t/chat" />
        <span className="text-[15px] font-bold text-ink">새 메시지</span>
      </div>
      <Body className="py-2">
        <NewChatClient members={members} />
      </Body>
    </div>
  );
}
