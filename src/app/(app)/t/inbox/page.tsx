import { getInbox } from "@/lib/data/groups/scheduling";
import InboxClient from "./ui";

export default async function InboxPage() {
  const view = await getInbox();
  return <InboxClient view={view} />;
}
