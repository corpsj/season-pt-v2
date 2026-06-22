import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/icon";
import { getChatThreads, getChatUnread, getMe, getMembers } from "@/lib/data";
import { trainerTabs } from "@/components/trainer/tabs";

export default function TrainerChatListPage() {
  const me = getMe();
  const threads = getChatThreads();
  const totalMembers = getMembers("all").totals.total;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[21px] font-bold text-ink">채팅</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-banner2 px-3 py-1.5 text-[12px] font-semibold text-[#5b6452]">
            <Icon name="persons" size={15} className="text-sage-deep" />
            담당회원 {totalMembers}
          </span>
        </div>

        {/* thread list */}
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
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread: getChatUnread() })} />
    </div>
  );
}
