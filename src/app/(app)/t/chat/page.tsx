import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import {
  getChatThreads,
  getChatUnread,
  getMe,
  getMembersCount,
} from "@/lib/data/groups/chat";
import { trainerTabs } from "@/components/trainer/tabs";
import { ChatListClient } from "./ChatListClient";

export default async function TrainerChatListPage() {
  const [me, threads, totalMembers, chatUnread] = await Promise.all([
    getMe(),
    getChatThreads(),
    getMembersCount(),
    getChatUnread(),
  ]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header + thread list (live) */}
        <ChatListClient initial={threads} isOwner={me.isOwner} totalMembers={totalMembers} />
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />
    </div>
  );
}
