"use client";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

/** Back affordance (.bk): 38px white square. Navigates back or to a fallback. */
export function BackButton({
  fallback,
  icon = "chevron-left",
}: {
  fallback?: string;
  icon?: IconName;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로"
      onClick={() => (fallback ? router.push(fallback) : router.back())}
      className="tappable relative flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-ink/[0.07] bg-card text-ink after:absolute after:-inset-[3px] after:content-[''] hover:bg-[#f4f0e8]"
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
