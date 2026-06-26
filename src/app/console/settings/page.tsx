import { Topbar } from "@/components/console/Topbar";
import { getAllProducts, getStudioSettings } from "@/lib/data/groups/owner-ops";
import { SettingsClient } from "./ui";

export default async function ConsoleSettingsPage() {
  const [products, settings] = await Promise.all([getAllProducts(), getStudioSettings()]);
  return (
    <>
      <Topbar title="설정" sub="회원권 상품 · 운영 정책 · 알림" />
      <div className="flex-1 overflow-y-auto px-[34px] pb-12 pt-6">
        <div className="max-w-[880px]">
          <SettingsClient products={products} settings={settings} />
        </div>
      </div>
    </>
  );
}
