import { redirect } from "next/navigation";
import { getMemberClassDetail } from "@/lib/data/groups/member";
import { MemberClassDetailClient } from "./ui";

export default async function MemberClassDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const view = await getMemberClassDetail(id);
  if (!view) redirect("/m"); // 본인 세션이 아니거나 없는 세션 — 조용히 홈으로.
  return <MemberClassDetailClient view={view} />;
}
