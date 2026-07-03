import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMemberSentRequests } from "@/lib/data/groups/member";
import { MemberSentRequestsList } from "./ui";

export default async function MemberSentRequestsPage() {
  const requests = await getMemberSentRequests();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">일정 요청 내역</span>
        </div>

        {requests.length === 0 ? (
          <EmptyState
            icon="clock"
            title="보낸 요청이 없어요"
            desc="일정 변경·취소를 요청하면 여기서 처리 상태를 볼 수 있어요."
          />
        ) : (
          <MemberSentRequestsList requests={requests} />
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
