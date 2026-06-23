import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Icon } from "@/components/ui/icon";
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
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[21px] font-bold text-ink">채팅</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-banner2 px-3 py-1.5 text-[12px] font-semibold text-[#5b6452]">
              <Icon name="persons" size={15} className="text-sage-deep" />
              담당회원 {totalMembers}
            </span>
            <Link
              href="/t/chat/new"
              aria-label="새 메시지"
              className="tappable flex h-9 w-9 items-center justify-center rounded-full bg-sage text-surface active:scale-90"
            >
              <Icon name="pencil" size={17} />
            </Link>
          </div>
        </div>

        {/* thread list (live) */}
        <ChatListClient initial={threads} />
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread })} liveChat />
    </div>
  );
}
