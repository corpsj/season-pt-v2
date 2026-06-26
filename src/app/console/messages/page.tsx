import { Topbar } from "@/components/console/Topbar";
import { getChatThreads, getChatRoom, getMessageableMembers } from "@/lib/data/groups/chat";
import { MessagesClient } from "./ui";

export default async function ConsoleMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const [threads, members] = await Promise.all([getChatThreads(), getMessageableMembers()]);
  const sel = sp.t ?? threads[0]?.id ?? null;
  const initialRoom = sel ? await getChatRoom(sel) : null;

  return (
    <>
      <Topbar title="메시지" sub={`대화 ${threads.length}개`} />
      <div className="flex min-h-0 flex-1">
        <MessagesClient initialThreads={threads} initialRoom={initialRoom} members={members} />
      </div>
    </>
  );
}
