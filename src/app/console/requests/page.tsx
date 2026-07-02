import { Icon } from "@/components/ui/icon";
import { Topbar } from "@/components/console/Topbar";
import { getStudioInbox } from "@/lib/data/groups/console";
import { RequestsClient } from "./ui";

export default async function ConsoleRequestsPage() {
  const { pending, done } = await getStudioInbox();
  return (
    <>
      <Topbar title="일정 조율" sub={`처리 대기 ${pending.length}건`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-[18px] flex items-center gap-2 rounded-[13px] border border-[rgba(184,154,94,0.22)] bg-[#F4EEE3] px-4 py-3">
            <Icon name="circle-info" size={17} style={{ color: "#8A6F3E" }} />
            <span className="text-[12.5px] font-semibold text-[#5B4B38]">회원이 보낸 일정 변경·취소 요청이에요. 승인하면 캘린더에 자동 반영돼요.</span>
          </div>
          <RequestsClient pending={pending} done={done} />
        </div>
      </div>
    </>
  );
}
