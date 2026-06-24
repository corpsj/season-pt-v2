import { getRevenue } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import { RevenueClient } from "./ui";

export default async function RevenuePage() {
  await requireOwnerPage(); // 대표 전용
  const view = await getRevenue();
  return <RevenueClient view={view} />;
}
