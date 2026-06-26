import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { Topbar } from "@/components/console/Topbar";
import { Card, CardHead, DPill, won, pill } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { getStudioOps } from "@/lib/data/groups/owner-ops";
import { getRetention } from "@/lib/data/groups/perf-retention";
import { getChatUnread } from "@/lib/data/groups/trainer-home";
import { getStudioToday, getTrainerPerf } from "@/lib/data/groups/console";
import type { SessionStatus } from "@/lib/types";

const EXP_DAYS = 14;

function statusPill(status: SessionStatus) {
  if (status === "attended") return <span style={pill("#5C9166", "#EDF4E3")}>출석</span>;
  if (status === "noshow") return <span style={pill("#C67352", "#FBF3E9")}>노쇼</span>;
  if (status === "cancelled") return <span style={pill("#8C8475", "#EFEAE1")}>취소</span>;
  return <span style={pill("#847A66", "#F4EFE6")}>예정</span>;
}

function Kpi({
  label,
  icon,
  iconBg = "#EDF4E3",
  iconColor = "#6B785E",
  children,
  foot,
  alert,
}: {
  label: string;
  icon: IconName;
  iconBg?: string;
  iconColor?: string;
  children: React.ReactNode;
  foot: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <Card className="px-5 pb-[18px] pt-5" style={alert ? { borderColor: "rgba(198,115,82,0.18)" } : undefined}>
      <div className="mb-3.5 flex items-center justify-between">
        <span className="whitespace-nowrap text-[13px] font-semibold text-[#847A66]">{label}</span>
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ background: iconBg }}>
          <Icon name={icon} size={17} style={{ color: iconColor }} />
        </span>
      </div>
      {children}
      <div className="mt-3">{foot}</div>
    </Card>
  );
}

export default async function ConsoleDashboard() {
  const [ops, retention, today, perf, chatUnread] = await Promise.all([
    getStudioOps(),
    getRetention(),
    getStudioToday(),
    getTrainerPerf(),
    getChatUnread(),
  ]);

  const todos: { icon: IconName; bg: string; color: string; title: string; desc: string; href: string; action: string }[] = [];
  if (retention.expiringCount > 0)
    todos.push({ icon: "triangle-exclamation", bg: "#FBF3E9", color: "#C67352", title: `만료 임박 회원 ${retention.expiringCount}명`, desc: "재등록 안내가 필요해요", href: "/console/members", action: "회원" });
  if (ops.pendingRequests > 0)
    todos.push({ icon: "refresh", bg: "#FBF3E9", color: "#C67352", title: `처리 대기 요청 ${ops.pendingRequests}건`, desc: "일정 변경·취소 요청", href: "/console/requests", action: "확인" });
  if (chatUnread > 0)
    todos.push({ icon: "message", bg: "#EDF4E3", color: "#6B785E", title: `답장 안 한 채팅 ${chatUnread}건`, desc: "회원·강사 메시지", href: "/console/messages", action: "열기" });

  const expiringList = retention.items.slice(0, 5);

  return (
    <>
      <Topbar title="운영 현황" sub={`${ops.monthLabel} · 스튜디오 한눈에 보기`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-11 pt-[30px]">
        {/* KPI */}
        <div className="mb-5 grid grid-cols-4 gap-[18px]">
          <Kpi
            label="오늘 수업"
            icon="calendar-fill"
            foot={
              <div className="flex gap-1.5">
                <span style={pill("#5C9166", "#EDF4E3")}>출석 {today.attended}</span>
                <span style={pill("#847A66", "#F4EFE6")}>예정 {today.scheduled}</span>
                {today.noshow > 0 ? <span style={pill("#C67352", "#FBF3E9")}>노쇼 {today.noshow}</span> : null}
              </div>
            }
          >
            <div className="flex items-end gap-[5px]">
              <span className="serif text-[40px] font-semibold leading-[0.85] text-ink">{today.total}</span>
              <span className="pb-1 text-[14px] font-semibold text-[#9A917F]">건</span>
            </div>
          </Kpi>

          <Kpi
            label="이번 달 매출"
            icon="coins-fill"
            foot={
              ops.revenueDeltaPct != null ? (
                <span className="flex items-center gap-[5px]">
                  <Icon name="arrow-up-right" size={14} style={{ color: ops.revenueDeltaPct >= 0 ? "#5C9166" : "#C67352" }} />
                  <span className="text-[12px] font-semibold" style={{ color: ops.revenueDeltaPct >= 0 ? "#5C9166" : "#C67352" }}>
                    전월 대비 {ops.revenueDeltaPct >= 0 ? "+" : ""}{ops.revenueDeltaPct}%
                  </span>
                </span>
              ) : (
                <span className="text-[12px] font-semibold text-[#9A917F]">{ops.paymentCount}건 결제</span>
              )
            }
          >
            <Money className="serif text-[30px] font-semibold leading-[0.9] text-ink">{won(ops.revenueThisMonth)}</Money>
          </Kpi>

          <Kpi
            label="활성 회원"
            icon="persons-fill"
            foot={
              <span className="flex items-center gap-[5px]">
                <Icon name="arrow-up-right" size={14} className="text-sage-leaf" />
                <span className="text-[12px] font-semibold text-[#847A66]">이번 달 신규 {ops.newMembers}명</span>
              </span>
            }
          >
            <div className="flex items-end gap-[5px]">
              <span className="serif text-[40px] font-semibold leading-[0.85] text-ink">{ops.activeMembers}</span>
              <span className="pb-1 text-[14px] font-semibold text-[#9A917F]">명</span>
            </div>
          </Kpi>

          <Kpi
            label="만료 임박"
            icon="triangle-exclamation"
            iconBg="#FBF3E9"
            iconColor="#C67352"
            alert
            foot={<span className="text-[12px] font-semibold text-[#B5612F]">{EXP_DAYS}일 이내 · 재등록 안내</span>}
          >
            <div className="flex items-end gap-[5px]">
              <span className="serif text-[40px] font-semibold leading-[0.85] text-terracotta">{retention.expiringCount}</span>
              <span className="pb-1 text-[14px] font-semibold text-[#C99A82]">명</span>
            </div>
          </Kpi>
        </div>

        {/* two columns */}
        <div className="grid grid-cols-[1.55fr_1fr] gap-[18px]">
          <div className="flex flex-col gap-[18px]">
            {/* 처리할 일 */}
            <Card className="px-6 pb-3 pt-5">
              <CardHead
                title="처리할 일"
                count={todos.length > 0 ? <span style={pill("#C67352", "#FBF3E9")}>{todos.length}건</span> : undefined}
                right={<span className="text-[12px] font-medium text-[#9A917F]">대표가 직접 확인해요</span>}
              />
              {todos.length > 0 ? (
                <div className="mt-2">
                  {todos.map((t) => (
                    <div key={t.title} className="flex items-center gap-[13px] border-t border-[rgba(75,59,46,0.06)] py-[13px]">
                      <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]" style={{ background: t.bg }}>
                        <Icon name={t.icon} size={18} style={{ color: t.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink">{t.title}</div>
                        <div className="mt-px text-[11.5px] font-medium text-[#9A917F]">{t.desc}</div>
                      </div>
                      <Link href={t.href} className="flex-none rounded-[10px] border border-[rgba(75,59,46,0.12)] bg-white px-3.5 py-[7px] text-[13px] font-semibold text-[#766D60] transition hover:bg-[#F4F0E8]">
                        {t.action}
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3 border-t border-[rgba(75,59,46,0.06)] py-5">
                  <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[#EDF4E3]">
                    <Icon name="check-bold" size={18} className="text-sage-deep" />
                  </div>
                  <div className="text-[13.5px] font-medium text-[#847A66]">처리할 일이 없어요</div>
                </div>
              )}
            </Card>

            {/* 오늘의 수업 */}
            <Card className="py-5 pl-6 pr-2">
              <div className="mb-1.5 flex items-center justify-between pr-4">
                <div className="text-[16px] font-bold text-ink">오늘의 수업</div>
                <Link href="/console/calendar" className="inline-flex items-center gap-[3px] text-[12.5px] font-semibold text-sage-deep">
                  캘린더 <Icon name="chevron-right" size={14} />
                </Link>
              </div>
              {today.classes.length > 0 ? (
                today.classes.map((c) => (
                  <div key={c.sessionId} className="flex items-center gap-3.5 border-b border-[rgba(75,59,46,0.05)] py-3 pr-4">
                    <div className="serif w-[60px] flex-none text-[18px] font-semibold text-ink">{c.start}</div>
                    <div className="h-2 w-2 flex-none rounded-full" style={{ background: c.color }} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[14px] font-semibold text-ink">{c.member}</span>
                      <span className="text-[13px] font-medium text-[#9A917F]"> · {c.trainerName}</span>
                    </div>
                    {statusPill(c.status)}
                  </div>
                ))
              ) : (
                <div className="py-10 pr-4 text-center text-[13px] font-medium text-[#A89F92]">오늘 예정된 수업이 없어요</div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-[18px]">
            {/* 만료 임박 회원 */}
            <Card className="px-5 pb-4 pt-5">
              <CardHead title="만료 임박 회원" right={<Link href="/console/members" className="text-[12.5px] font-semibold text-sage-deep">전체</Link>} className="mb-3.5" />
              {expiringList.length > 0 ? (
                <div className="flex flex-col gap-[9px]">
                  {expiringList.map((m) => (
                    <div key={m.memberId} className="flex items-center gap-[11px] rounded-[13px] bg-[#FBF7F1] px-3 py-[11px]">
                      <Avatar initial={m.initial} tone={m.avatarTone} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink">{m.name}</div>
                        <div className="text-[11px] font-medium text-[#9A917F]">잔여 {m.remaining}회{m.guided ? " · 안내완료" : ""}</div>
                      </div>
                      <DPill dDay={m.dDay} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-[13px] font-medium text-[#A89F92]">만료 임박 회원이 없어요</div>
              )}
            </Card>

            {/* 강사 실적 */}
            <Card className="px-5 pb-[18px] pt-5">
              <CardHead title="강사 실적" right={<span className="text-[12px] font-medium text-[#9A917F]">{ops.monthLabel.replace(/^\d+년\s/, "")}</span>} className="mb-3.5" />
              <div className="flex flex-col gap-[15px]">
                {perf.map((t) => (
                  <div key={t.id}>
                    <div className="mb-[7px] flex items-center gap-[9px]">
                      <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-[11px] font-semibold text-white" style={{ background: t.color }}>
                        {t.name.slice(0, 1)}
                      </div>
                      <span className="flex-1 text-[13px] font-semibold text-ink">{t.name}</span>
                      <span className="text-[12.5px] font-bold text-ink">{t.sessions}회</span>
                    </div>
                    <div className="h-[7px] overflow-hidden rounded-[4px] bg-[#F0ECE3]">
                      <div className="h-full rounded-[4px]" style={{ background: t.color, width: `${t.pct}%` }} />
                    </div>
                  </div>
                ))}
                {perf.length === 0 ? <div className="py-4 text-center text-[13px] font-medium text-[#A89F92]">강사가 없어요</div> : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
