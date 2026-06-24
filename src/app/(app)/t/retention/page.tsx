import { getRetention } from "@/lib/data/groups/perf-retention";
import { requireOwnerPage } from "@/lib/auth/guard";
import RetentionUI from "./ui";

export default async function RetentionPage() {
  await requireOwnerPage(); // 대표 전용
  const view = await getRetention();
  return <RetentionUI view={view} />;
}
