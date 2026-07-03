import { getInbox } from "@/lib/data/groups/scheduling";
import { markInboxSeen } from "@/lib/data/groups/scheduling-actions";
import InboxClient from "./ui";

export default async function InboxPage() {
  await markInboxSeen().catch(() => {}); // best-effort: 회원 발의 요청을 '확인함'으로 표식(M2 대칭)
  const view = await getInbox();
  return <InboxClient view={view} />;
}
