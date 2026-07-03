import { Topbar } from "@/components/console/Topbar";
import { getAllProducts, getStudioSettings, getAllExercises, getStudioNotices } from "@/lib/data/groups/owner-ops";
import { getTrainerContext } from "@/lib/auth/context";
import { SettingsClient } from "./ui";

export default async function ConsoleSettingsPage() {
  const [products, settings, exercises, notices, me] = await Promise.all([
    getAllProducts(),
    getStudioSettings(),
    getAllExercises(),
    getStudioNotices(),
    getTrainerContext(),
  ]);
  return (
    <>
      <Topbar title="설정" sub="회원권 상품 · 운영 정책 · 알림" />
      <div className="flex-1 overflow-y-auto px-[34px] pb-12 pt-6">
        <div className="mx-auto max-w-[880px]">
          <SettingsClient
            products={products}
            settings={settings}
            exercises={exercises}
            notices={notices}
            displayName={me?.displayName ?? ""}
          />
        </div>
      </div>
    </>
  );
}
