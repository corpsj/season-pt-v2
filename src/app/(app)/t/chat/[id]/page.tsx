import { redirect } from "next/navigation";
import { getChatRoom } from "@/lib/data/groups/chat";
import { currentKstDayKeys } from "@/lib/chat/day-labels";
import { ChatRoomClient } from "./ui";

export default async function TrainerChatRoomPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  // 삭제된(또는 접근 불가) 스레드로 들어오면 오류 대신 채팅 목록으로 보낸다.
  const room = await getChatRoom(id).catch(() => null);
  if (!room) redirect("/t/chat");
  return <ChatRoomClient room={room} dayKeys={currentKstDayKeys()} />;
}
