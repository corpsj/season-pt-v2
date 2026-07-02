import { requireOwnerPage } from "@/lib/auth/guard";
import { getAllProducts, getAllDiscounts } from "@/lib/data/groups/owner-ops";
import { ProductsClient } from "./ui";

export default async function ProductsPage() {
  await requireOwnerPage();
  const [products, discounts] = await Promise.all([getAllProducts(), getAllDiscounts()]);
  return <ProductsClient products={products} discounts={discounts} />;
}
