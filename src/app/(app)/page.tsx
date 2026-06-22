import Image from "next/image";
import { Body, Footer } from "@/components/shell/Body";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";

export default function StartPage() {
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
