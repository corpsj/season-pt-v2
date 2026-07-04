import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icon";
import { getMyFiles } from "@/lib/data/groups/member-files";
import { getMyBodyHistory } from "@/lib/data/groups/body";
import { BodySection } from "./BodySection";
import { MyPhotos } from "./MyPhotos";

export default async function MemberBodyPage() {
  const [history, photos, inbodies] = await Promise.all([
    getMyBodyHistory(),
    getMyFiles("photo"),
    getMyFiles("inbody"),
  ]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">체형 기록</span>
        </div>

        {/* 체성분 — 본인 기록 + 추세 (클라이언트) */}
        <BodySection history={history} />

        {/* 진행 사진 — 회원 본인 업로드(날짜 지정)/삭제/비교 */}
        <MyPhotos initial={photos} />

        {/* 인바디 — 강사가 남긴 기록(읽기 전용) */}
        <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">인바디</div>
        {inbodies.length === 0 ? (
          <Card className="py-4 text-center text-[12.5px] font-medium text-muted">아직 인바디 결과가 없어요</Card>
        ) : (
          <Card className="divide-y divide-ink/[0.06] px-4 py-1">
            {inbodies.map((f) => (
              <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-3">
                <Icon name="document-text" size={16} className="flex-none text-sage" />
                <span className="flex-1 truncate text-[13px] font-semibold text-ink">인바디 · {f.takenAt.replace(/-/g, ".")}</span>
                <Icon name="chevron-right" size={16} className="flex-none text-muted" />
              </a>
            ))}
          </Card>
        )}
        <div className="h-2" />
      </Body>
    </div>
  );
}
