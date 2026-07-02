import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { Topbar } from "@/components/console/Topbar";
import { Card, DPill, MicroLabel } from "@/components/console/ui";
import { getStaff, getStaffMember } from "@/lib/data/groups/owner-ops";
import { getTrainerConsoleDetail, getTrainerPerf } from "@/lib/data/groups/console";
import { AddTrainerButton, TrainerActions } from "./ui";

function roleChip(role: string, hasLogin = true) {
  if (role === "owner") return <span className="rounded-[7px] bg-[#F3EAD2] px-2 py-[3px] text-[10.5px] font-bold text-[#9A7B2E]">대표</span>;
  if (role === "invited")
    return hasLogin
      ? <span className="rounded-[7px] bg-[#FBF3E9] px-2 py-[3px] text-[10.5px] font-bold text-[#B5612F]">초대 대기</span>
      : <span className="rounded-[7px] bg-[#EFEAE1] px-2 py-[3px] text-[10.5px] font-bold text-[#8C8475]">계정 미발급</span>;
  return <span className="rounded-[7px] bg-[#EDF4E3] px-2 py-[3px] text-[10.5px] font-bold text-[#5B6452]">강사</span>;
}

export default async function ConsoleTrainersPage({
  searchParams,
}: {
  searchParams: Promise<{ sel?: string }>;
}) {
  const sp = await searchParams;
  const [staff, perf] = await Promise.all([getStaff(), getTrainerPerf()]);
  const selId = sp.sel ?? staff[0]?.id ?? null;
  const [detail, extra] = selId
    ? await Promise.all([getStaffMember(selId), getTrainerConsoleDetail(selId)])
    : [null, null];

  const activeCount = staff.filter((s) => s.role !== "invited").length;
  const pendingCount = staff.filter((s) => s.role === "invited").length;
  const totalSessions = perf.reduce((s, p) => s + p.sessions, 0);
  // 초대 대기 배너는 "로그인 계정 발급됨 + 첫 로그인 전"에만. 명단만 등록된 강사는 상세/발급 UI를 그대로 보여준다.
  const pending = detail?.status === "invited" && detail.hasLogin;

  return (
    <>
      <Topbar title="강사 관리" sub={`활성 ${activeCount}명 · 초대 대기 ${pendingCount}명`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        <div className="mx-auto max-w-[1200px]">
        {/* summary strip */}
        <div className="mb-[18px] flex items-stretch gap-3">
          <Card className="flex flex-1 items-center gap-[18px] px-[22px] py-[15px]">
            <Summary label="활성 강사" value={activeCount} unit="명" />
            <div className="h-[34px] w-px bg-[rgba(75,59,46,0.08)]" />
            <Summary label="초대 대기" value={pendingCount} unit="명" color="#B5612F" />
            <div className="h-[34px] w-px bg-[rgba(75,59,46,0.08)]" />
            <Summary label="이번 달 총 수업" value={totalSessions} unit="회" />
          </Card>
          <AddTrainerButton />
        </div>

        <div className="grid grid-cols-[340px_1fr] items-start gap-[18px]">
          {/* roster */}
          <Card className="overflow-hidden">
            <div className="border-b border-[rgba(75,59,46,0.07)] px-[18px] py-[13px] text-[11.5px] font-semibold tracking-[0.02em] text-[#9A917F]">강사 명단</div>
            {staff.map((s) => {
              const on = s.id === selId;
              return (
                <Link key={s.id} href={`/console/trainers?sel=${s.id}`} className={`block border-b border-[rgba(75,59,46,0.05)] px-[18px] py-3.5 transition-colors ${on ? "bg-[#EDF4E3]" : "hover:bg-[#FBFAF7]"}`}>
                  <div className="flex items-center gap-3">
                    <Avatar initial={s.initial} tone={s.avatarTone} size={44} fontSize={16} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14.5px] font-bold text-ink">{s.name}</span>
                        {roleChip(s.role, s.hasLogin)}
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-[#9A917F]">{s.sub}</div>
                    </div>
                    <Icon name="chevron-right" size={17} className="flex-none text-[#C2BAAD]" />
                  </div>
                </Link>
              );
            })}
          </Card>

          {/* detail */}
          <Card className="sticky top-0 p-6">
            {detail ? (
              <>
                <div className="mb-5 flex items-center gap-[15px]">
                  <Avatar initial={detail.name.slice(0, 1)} size={62} fontSize={23} tone={detail.isOwner ? "gold" : "sage"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[21px] font-bold tracking-[-0.01em] text-ink">{detail.name}</span>
                      {roleChip(detail.status === "invited" ? "invited" : detail.role, detail.hasLogin)}
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium text-[#847A66]">{detail.phone || "연락처 미등록"} · {detail.hasLogin ? `@${detail.username}` : "로그인 미발급"}</div>
                  </div>
                </div>

                {pending ? (
                  <div className="flex items-center gap-3.5 rounded-[15px] border border-[rgba(198,115,82,0.2)] bg-[#FBF3E9] px-5 py-[18px]">
                    <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] bg-white"><Icon name="lock-fill" size={20} className="text-terracotta" /></div>
                    <div className="flex-1">
                      <div className="text-[13.5px] font-semibold text-[#5B4B38]">초대 대기 · 첫 로그인 전</div>
                      <div className="mt-0.5 text-[12px] font-medium text-[#9A8772]">강사가 <b className="text-[#5B4B38]">@{detail.username}</b> 로 첫 로그인하면 담당 배정·실적이 표시돼요.</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-[18px] grid grid-cols-3 gap-2.5">
                      <StatBox label="담당 회원" value={detail.memberCount} unit="명" />
                      <StatBox label="이번 주 수업" value={extra?.weekSessions ?? 0} unit="회" />
                      <StatBox label="이번 달 수업" value={extra?.monthSessions ?? 0} unit="회" />
                    </div>

                    <div className="mb-2.5 flex items-center justify-between">
                      <MicroLabel>담당 회원 {detail.memberCount}명</MicroLabel>
                    </div>
                    {extra && extra.members.length > 0 ? (
                      <div className="mb-[18px] flex flex-col gap-2">
                        {extra.members.map((m) => (
                          <Link key={m.id} href={`/console/members?sel=${m.id}`} className="flex items-center gap-[11px] rounded-[12px] bg-[#FBF7F1] px-3.5 py-[11px] transition hover:brightness-[0.985]">
                            <Avatar initial={m.initial} tone={m.avatarTone} size={36} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[13.5px] font-semibold text-ink">{m.name}</div>
                              <div className="text-[11px] font-medium text-[#9A917F]">{m.product} · 잔여 {m.remaining}회</div>
                            </div>
                            <DPill dDay={m.dDay} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="mb-[18px] px-0.5 text-[12px] font-medium text-[#B3AA9C]">담당 회원이 없어요</div>
                    )}

                    <TrainerActions id={detail.id} name={detail.name} phone={detail.phone} active={detail.status === "active"} isOwner={detail.isOwner} isMe={detail.isMe} memberCount={detail.memberCount} hasLogin={detail.hasLogin} />
                  </>
                )}
              </>
            ) : (
              <div className="py-16 text-center text-[14px] font-medium text-[#A89F92]">강사를 선택하세요</div>
            )}
          </Card>
        </div>
        </div>
      </div>
    </>
  );
}

function Summary({ label, value, unit, color }: { label: string; value: number; unit: string; color?: string }) {
  return (
    <div>
      <div className="mb-[3px] text-[11.5px] font-medium text-[#9A917F]">{label}</div>
      <div><span className="serif text-[24px] font-semibold" style={{ color: color ?? "#4B3B2E" }}>{value}</span><span className="text-[12px] font-medium text-[#9A917F]"> {unit}</span></div>
    </div>
  );
}
function StatBox({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-[14px] bg-[#FBF7F1] p-3.5">
      <div className="mb-1 text-[11px] font-medium text-[#9A917F]">{label}</div>
      <div><span className="serif text-[23px] font-semibold text-ink">{value}</span><span className="text-[11px] font-medium text-[#9A917F]"> {unit}</span></div>
    </div>
  );
}
