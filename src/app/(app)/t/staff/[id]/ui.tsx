"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Kicker } from "@/components/ui/Kicker";
import { Field, PhoneInput } from "@/components/ui/Field";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Switch } from "@/components/ui/Switch";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  updateInstructor,
  setInstructorActive,
  deleteInstructor,
  resetInstructorPassword,
  issueInstructorLogin,
} from "@/lib/auth/trainer-actions";
import { reassignMembers } from "@/lib/data/groups/owner-ops-actions";
import type { StaffMemberDetail } from "@/lib/data/groups/owner-ops";

export function StaffDetailClient({
  member,
  reassignTargets = [],
}: {
  member: StaffMemberDetail;
  reassignTargets?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [active, setActive] = useState(member.status === "active");
  const [busy, setBusy] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string } | null>(null);

  async function onIssueLogin() {
    if (busy) return;
    setBusy(true);
    const r = await issueInstructorLogin(member.id);
    setBusy(false);
    if (!r.ok || !r.username) return toast(r.error ?? "계정 발급에 실패했어요", "error");
    setIssued({ username: r.username });
    toast("로그인 계정을 발급했어요");
    router.refresh();
  }

  async function onReassign() {
    if (busy || !reassignTo) return;
    if (!(await confirm({ title: `${member.name} 강사의 회원을 이관할까요?`, description: "담당 회원·정기수업·채팅이 선택한 강사에게 넘어가요.", confirmLabel: "이관" }))) return;
    setBusy(true);
    const res = await reassignMembers(member.id, reassignTo);
    setBusy(false);
    if (res.ok) {
      toast(`회원 ${res.moved ?? 0}명을 이관했어요`);
      setReassignTo("");
      router.refresh();
    } else {
      toast(res.error ?? "이관에 실패했어요", "error");
    }
  }

  const roleText = member.isOwner
    ? "대표"
    : member.status === "invited"
      ? member.hasLogin ? "초대 대기" : "계정 미발급"
      : "강사";
  const roleVariant = member.isOwner ? "owner" : member.status === "invited" ? "invited" : "instructor";

  async function onSave() {
    if (busy) return;
    setBusy(true);
    const res = await updateInstructor(member.id, name, phone);
    setBusy(false);
    toast(res.ok ? "강사 정보를 저장했어요" : (res.error ?? "저장에 실패했어요"), res.ok ? "success" : "error");
    if (res.ok) router.refresh();
  }

  async function onToggle(next: boolean) {
    if (busy) return;
    setActive(next); // optimistic
    setBusy(true);
    const res = await setInstructorActive(member.id, next);
    setBusy(false);
    if (!res.ok) {
      setActive(!next);
      toast(res.error ?? "상태 변경에 실패했어요", "error");
    } else {
      toast(next ? "강사를 활성화했어요" : "강사를 비활성화했어요");
      router.refresh();
    }
  }

  async function onResetPassword() {
    if (busy) return;
    if (!(await confirm({ title: `${member.name} 강사의 비밀번호를 초기화할까요?`, description: "임시 비밀번호가 발급돼요.", confirmLabel: "초기화" }))) return;
    setBusy(true);
    const r = await resetInstructorPassword(member.id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "초기화에 실패했어요", "error");
    setTempPw(r.tempPassword ?? null);
  }

  async function onDelete() {
    if (busy) return;
    if (!(await confirm({ title: `${member.name} 강사를 삭제할까요?`, description: "계정이 완전히 삭제돼요. 되돌릴 수 없어요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(true);
    const res = await deleteInstructor(member.id);
    setBusy(false);
    if (res.ok) {
      toast("강사를 삭제했어요");
      router.push("/t/staff");
      router.refresh();
    } else {
      toast(res.error ?? "삭제에 실패했어요", "error");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/staff" />
          <span className="text-[19px] font-bold text-ink">강사 관리</span>
        </div>

        {/* profile */}
        <Card className="mb-6 flex items-center gap-3 p-4">
          <Avatar initial={member.name.charAt(0) || "강"} tone="sage" size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-ink">{member.name}</span>
              <Badge variant={roleVariant} icon={member.isOwner ? "crown-fill" : undefined}>
                {roleText}
              </Badge>
            </div>
            <div className="mt-0.5 text-[12.5px] font-medium text-muted">
              {member.hasLogin ? member.username : "로그인 미발급"} · 담당 {member.memberCount}명
            </div>
          </div>
        </Card>

        {member.isOwner ? (
          <Banner tone="owner">대표 계정이에요. 강사 관리에서는 수정할 수 없어요.</Banner>
        ) : (
          <>
            {member.status === "invited" && member.hasLogin ? (
              <div className="mb-4">
                <Banner tone="neutral">
                  아직 첫 로그인 전이에요. 강사가 본인 전화번호로 접속하면 자동으로 활성화돼요.
                </Banner>
              </div>
            ) : null}
            {!member.hasLogin ? (
              <div className="mb-4">
                <Banner tone="neutral">
                  명단에만 등록된 강사예요. 담당 배정은 지금도 가능하고, 앱 로그인은 아래에서 아이디를 발급하면 열려요.
                </Banner>
              </div>
            ) : null}

            {/* edit */}
            <div className="mb-2.5">
              <Kicker>정보 수정</Kicker>
            </div>
            <div className="flex flex-col gap-3.5">
              <Field icon="person" label="강사 이름">
                <PlainTextInput value={name} onChange={setName} className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder" />
              </Field>
              <Field icon="phone" label="연락처">
                <PhoneInput placeholder="010-0000-0000" value={phone} onValueChange={setPhone} />
              </Field>
            </div>
            <div className="mt-3.5">
              <PrimaryButton icon="check-bold" onClick={onSave} disabled={busy}>
                저장
              </PrimaryButton>
            </div>

            {/* status */}
            {member.status !== "invited" ? (
              <>
                <div className="mb-2.5 mt-7">
                  <Kicker>운영 상태</Kicker>
                </div>
                <Card className="flex items-center gap-3 px-4 py-[15px]">
                  <Icon name="person" size={18} className="flex-none text-sage" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-ink">활성 상태</div>
                    <div className="mt-0.5 text-[12px] font-medium text-muted">
                      {active ? "운영 중인 강사예요" : "비활성 — 운영 현황에서 제외돼요"}
                    </div>
                  </div>
                  <Switch on={active} onChange={onToggle} disabled={busy} label="활성 상태" />
                </Card>
              </>
            ) : null}

            {/* login account: issue for placeholder, reset for existing. issued(방금 발급한 자격증명)는
                member.hasLogin이 refresh로 true로 바뀐 뒤에도 최우선으로 계속 보여야 한다(안 그러면
                발급 직후 router.refresh()가 화면을 "비밀번호 초기화" 상태로 바꿔버려 임시비번이 사라짐). */}
            {issued ? (
              <>
                <div className="mb-2.5 mt-7">
                  <Kicker>로그인 계정 발급</Kicker>
                </div>
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-[14px]">
                    <Icon name="phone" size={18} className="flex-none text-sage" />
                    <span className="flex-1 text-[12.5px] font-semibold text-muted5">로그인 아이디(전화번호)</span>
                    <span className="text-[14px] font-bold text-ink">{issued.username}</span>
                  </div>
                  <div className="border-t border-ink/[0.07] px-4 py-3 text-[12px] font-medium leading-[1.5] text-muted">
                    비밀번호 없이 본인 전화번호만 입력하면 로그인돼요. 로그인 후 본인이 진짜 아이디·비밀번호를 설정해요.
                  </div>
                </Card>
              </>
            ) : member.hasLogin ? (
              <>
                <div className="mb-2.5 mt-7">
                  <Kicker>비밀번호</Kicker>
                </div>
                <OutlineButton icon="lock" onClick={onResetPassword} disabled={busy || member.isMe}>
                  비밀번호 초기화
                </OutlineButton>
                {member.isMe ? (
                  <div className="mt-2.5 text-[12px] font-medium text-muted">본인 계정은 여기서 초기화할 수 없어요</div>
                ) : null}
                {tempPw ? (
                  <Banner tone="warn" className="mt-2.5">
                    임시 비밀번호: <b className="select-all">{tempPw}</b> — 지금 강사에게 전달하세요. 첫 로그인 시 변경이 강제돼요.
                  </Banner>
                ) : null}
              </>
            ) : (
              <>
                <div className="mb-2.5 mt-7">
                  <Kicker>로그인 계정 발급</Kicker>
                </div>
                {member.phone ? (
                  <>
                    <p className="mb-3 text-[12.5px] font-medium leading-[1.5] text-muted">
                      본인 전화번호({member.phone})가 로그인 아이디가 돼요. 비밀번호는 필요 없어요 — 로그인 후 본인이 아이디·비밀번호를 설정해요.
                    </p>
                    <PrimaryButton icon="lock-fill" onClick={onIssueLogin} disabled={busy}>
                      로그인 계정 발급
                    </PrimaryButton>
                  </>
                ) : (
                  <Banner tone="warn">먼저 위에서 연락처를 입력하고 저장해주세요. 전화번호가 로그인 아이디가 돼요.</Banner>
                )}
              </>
            )}

            {/* reassign members (퇴사 인수인계) */}
            {member.memberCount > 0 && reassignTargets.length > 0 ? (
              <>
                <div className="mb-2.5 mt-7">
                  <Kicker>회원 이관</Kicker>
                </div>
                <Card className="p-4">
                  <div className="mb-2.5 text-[12.5px] font-medium leading-[1.5] text-muted">
                    담당 {member.memberCount}명과 정기수업·채팅을 다른 강사에게 넘겨요. 지난 출석·정산 기록은 원래 강사에 남아요.
                  </div>
                  <select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="mb-3 w-full rounded-[11px] border border-ink/[0.12] bg-card px-3.5 py-2.5 text-[14px] font-medium text-ink outline-none"
                  >
                    <option value="">이관 받을 강사 선택</option>
                    {reassignTargets.map((tt) => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                  <PrimaryButton icon="persons" onClick={onReassign} disabled={busy || !reassignTo}>
                    회원 이관
                  </PrimaryButton>
                </Card>
              </>
            ) : null}

            {/* delete */}
            <div className="mb-2.5 mt-7">
              <Kicker>계정</Kicker>
            </div>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="tappable flex w-full items-center gap-3 rounded-[13px] bg-warm-banner px-4 py-[14px] text-left disabled:opacity-60"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-card text-terracotta">
                <Icon name="circle-close" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-terracotta-deep">강사 삭제</span>
                <span className="mt-0.5 block text-[12px] font-medium text-terracotta/80">
                  {member.memberCount > 0
                    ? "담당 회원이 있어 삭제하려면 먼저 비활성화/재배정이 필요해요"
                    : "계정과 데이터가 완전히 삭제돼요"}
                </span>
              </span>
              <Icon name="chevron-right" size={15} className="flex-none text-terracotta" />
            </button>
          </>
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
