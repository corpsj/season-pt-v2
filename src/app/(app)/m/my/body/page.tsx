import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { getMyFiles } from "@/lib/data/groups/member-files";

export default async function MemberBodyPage() {
  const [photos, inbodies] = await Promise.all([getMyFiles("photo"), getMyFiles("inbody")]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">체형 기록</span>
        </div>

        {photos.length === 0 && inbodies.length === 0 ? (
          <EmptyState icon="camera" title="아직 기록이 없어요" desc="수업 때 선생님이 진행 사진과 인바디를 남겨드려요." />
        ) : (
          <>
            <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">진행 사진</div>
            {photos.length === 0 ? (
              <Card className="mb-4 py-4 text-center text-[12.5px] font-medium text-muted">아직 사진이 없어요</Card>
            ) : (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {photos.map((f) =>
                  f.url ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                    </a>
                  ) : null,
                )}
              </div>
            )}

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
          </>
        )}
        <div className="h-2" />
      </Body>
    </div>
  );
}
