import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";

export default async function MemberPolicyPage() {
  const settings = await getStudioSettings();
  const cutoff = settings.cancelCutoffHours;

  const sections: { title: string; body: string }[] = [
    {
      title: "수업 예약·변경",
      body: "수업 시간 변경·취소는 마이페이지의 ‘일정 변경·취소’ 또는 담당 선생님 메시지로 요청할 수 있어요. 선생님이 확인 후 처리해 드려요.",
    },
    {
      title: "취소·차감 정책",
      body:
        cutoff > 0
          ? `수업 시작 ${cutoff}시간 전까지 취소하면 횟수가 차감되지 않아요. 이후 취소·노쇼는 매장 정책에 따라 1회 차감될 수 있어요.`
          : "수업 취소·노쇼 시 매장 정책에 따라 횟수가 차감될 수 있어요. 자세한 기준은 담당 선생님에게 확인해 주세요.",
    },
    {
      title: "회원권·환불",
      body: "회원권 환불 시 이용한 횟수는 정상가로 차감되고 남은 금액에서 위약금(통상 10%)이 제외돼요. 환불·양도는 담당 선생님에게 요청해 주세요.",
    },
    {
      title: "개인정보",
      body: "이름·연락처 등 회원 정보는 수업 운영과 안내 목적으로만 사용되며, 동의 없이 외부에 제공되지 않아요.",
    },
  ];

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">이용약관·정책</span>
        </div>

        {sections.map((s) => (
          <div key={s.title}>
            <Kicker className="mx-1 mb-[9px]">{s.title}</Kicker>
            <Card className="mb-[18px] p-[18px]">
              <p className="text-[13px] font-medium leading-[1.65] text-muted2">{s.body}</p>
            </Card>
          </div>
        ))}

        <p className="px-1 pb-6 text-[12px] font-medium leading-[1.6] text-placeholder">
          본 안내는 매장 운영 기준을 요약한 것으로, 자세한 내용은 담당 선생님에게 문의해 주세요.
        </p>
      </Body>
    </div>
  );
}
