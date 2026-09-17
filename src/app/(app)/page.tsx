import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { getMemberContext } from "@/lib/data/db";
import { getTrainerSetupContext } from "@/lib/auth/context";

/**
 * Real desktop BROWSER only — routes PC visitors to the owner console. Excludes mobile
 * UAs and link-preview/SEO crawlers (KakaoTalk/Facebook/Google …) so the root keeps
 * serving its OG metadata to scrapers.
 */
function isDesktopBrowser(ua: string): boolean {
  if (!ua) return false;
  if (/bot|crawl|spider|facebookexternalhit|kakao|slack|discordbot|twitterbot|whatsapp|line\/|telegrambot|embed|preview|googlebot|bingbot|yandex|baidu|duckduckbot|applebot|petalbot|naver|yeti/i.test(ua)) return false;
  if (/Mobi|Android|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry/i.test(ua)) return false;
  return true;
}

export default async function StartPage() {
  // PC visitors land on the owner console (which renders its own login). Mobile devices
  // and link-preview crawlers keep the member/trainer chooser below.
  const ua = (await headers()).get("user-agent") ?? "";
  if (isDesktopBrowser(ua)) redirect("/console");

  // Stay logged in: a returning user with a live session skips the chooser.
  const trainer = await getTrainerSetupContext();
  if (trainer) redirect(trainer.mustChangePassword ? "/set-password" : "/t");
  if (await getMemberContext()) redirect("/m");
  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="wide">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Image
            src="/brand/brand-mark.png"
            alt="계절 PT"
            width={96}
            height={96}
            className="mb-[18px]"
            priority
          />
          <div className="text-[22px] font-bold tracking-tight text-ink">계절 PT &amp; 필라테스</div>
          <div className="serif mt-1 text-[19px] italic text-sage-soft">Balance, consistently</div>
          <div className="mt-3.5 text-[13.5px] font-medium text-muted">균형 있게, 꾸준하게</div>
        </div>
      </Body>
      <Footer pad="wide" className="flex flex-col gap-[11px]">
        <PrimaryButton href="/login/member" icon="person">
          회원으로 로그인
        </PrimaryButton>
        <OutlineButton href="/login/trainer" icon="persons">
          트레이너로 로그인
        </OutlineButton>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[#a89f92]">
          <Icon name="plus" size={15} />
          <span className="text-[12px] font-medium">홈 화면에 추가하면 앱처럼 쓸 수 있어요</span>
        </div>
      </Footer>
    </div>
  );
}
