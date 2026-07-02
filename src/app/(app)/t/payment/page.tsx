import { getPaymentSummary, getDiscounts } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import { PaymentClient } from "./ui";

export default async function PaymentRecordPage(props: {
  searchParams: Promise<{ member?: string }>;
}) {
  await requireOwnerPage(); // 대표 전용
  const { member } = await props.searchParams;
  const [summary, discounts] = await Promise.all([getPaymentSummary(member), getDiscounts()]);
  return <PaymentClient summary={summary} discounts={discounts} />;
}
