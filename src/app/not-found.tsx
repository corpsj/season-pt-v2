import { Frame } from "@/components/shell/Frame";
import { Body, Footer } from "@/components/shell/Body";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton } from "@/components/ui/Button";

/** notFound()·없는 주소 공용 404 — 루트 레이아웃 안에서 렌더되므로 Frame을 직접 감싼다. */
export default function NotFound() {
  return (
    <Frame>
      <div className="scr flex min-h-0 flex-1 flex-col">
        <Body pad="form" className="justify-center">
          <EmptyState
            icon="circle-exclamation"
            title="페이지를 찾을 수 없어요"
            desc="주소가 바뀌었거나 더 이상 없는 페이지예요."
          />
        </Body>
        <Footer pad="form">
          <PrimaryButton href="/" icon="home">
            처음 화면으로
          </PrimaryButton>
        </Footer>
      </div>
    </Frame>
  );
}
