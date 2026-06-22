import { getProposeSlots } from "@/lib/data/groups/scheduling";
import ProposeClient from "./ui";

export default async function ProposePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const view = await getProposeSlots(id);
  return <ProposeClient sessionId={id} view={view} />;
}
