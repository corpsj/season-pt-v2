import { getMemberChatRoom } from "@/lib/data/groups/member";
import { MemberChatClient } from "./ui";

export default async function MemberChatPage(props: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const [room, { draft }] = await Promise.all([getMemberChatRoom(), props.searchParams]);

  return (
    <MemberChatClient
      trainerName={room.trainerName}
      initial={room.initial}
      sub={room.sub}
      isTeam={room.isTeam}
      messages={room.messages}
      cursor={room.cursor}
      truncated={room.truncated}
      initialDraft={draft ?? ""}
    />
  );
}
