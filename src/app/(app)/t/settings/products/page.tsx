import { requireOwnerPage } from "@/lib/auth/guard";
import { getAllProducts } from "@/lib/data/groups/owner-ops";
import { ProductsClient } from "./ui";

export default async function ProductsPage() {
  await requireOwnerPage();
  const products = await getAllProducts();
  return <ProductsClient products={products} />;
}
