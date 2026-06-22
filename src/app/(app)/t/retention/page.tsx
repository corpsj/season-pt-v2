import { getRetention } from "@/lib/data/groups/perf-retention";
import RetentionUI from "./ui";

export default async function RetentionPage() {
  const view = await getRetention();
  return <RetentionUI view={view} />;
}
