import { getPaymentSummary } from "@/lib/data/groups/owner-ops";
import { PaymentClient } from "./ui";

export default async function PaymentRecordPage(props: {
  searchParams: Promise<{ member?: string }>;
}) {
  const { member } = await props.searchParams;
  const summary = await getPaymentSummary(member);
  return <PaymentClient summary={summary} />;
}
