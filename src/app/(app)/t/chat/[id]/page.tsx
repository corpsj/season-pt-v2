import { getChatRoom } from "@/lib/data/groups/chat";
import { ChatRoomClient } from "./ui";

export default async function TrainerChatRoomPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const room = await getChatRoom(id);
  return <ChatRoomClient room={room} />;
}
