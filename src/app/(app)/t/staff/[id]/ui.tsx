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
import { Field, TextInput } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import {
  updateInstructor,
  setInstructorActive,
  deleteInstructor,
} from "@/lib/auth/trainer-actions";
import type { StaffMemberDetail } from "@/lib/data/groups/owner-ops";

export function StaffDetailClient({ member }: { member: StaffMemberDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [active, setActive] = useState(member.status === "active");
  const [busy, setBusy] = useState(false);

  const roleText = member.isOwner ? "대표" : member.status === "invited" ? "초대 대기" : "강사";
  const roleVariant = member.isOwner ? "owner" : member.status === "invited" ? "invited" : "instructor";

  async function onSave() {
    if (busy) return;
    setBusy(true);
    const res = await updateInstructor(member.id, name, phone);
    setBusy(false);
    toast(res.ok ? "강사 정보를 저장했어요" : res.error ?? "저장에 실패했어요");
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
      toast(res.error ?? "상태 변경에 실패했어요");
    } else {
      toast(next ? "강사를 활성화했어요" : "강사를 비활성화했어요");
      router.refresh();
    }
  }

  async function onDelete() {
    if (busy) return;
    if (!confirm(`${member.name} 강사를 삭제할까요? 계정이 완전히 삭제돼요.`)) return;
    setBusy(true);
    const res = await deleteInstructor(member.id);
    setBusy(false);
    if (res.ok) {
      toast("강사를 삭제했어요");
      router.push("/t/staff");
      router.refresh();
    } else {
      toast(res.error ?? "삭제에 실패했어요");
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
              {member.username} · 담당 {member.memberCount}명
            </div>
          </div>
        </Card>

        {member.isOwner ? (
          <Banner tone="owner">대표 계정이에요. 강사 관리에서는 수정할 수 없어요.</Banner>
        ) : (
          <>
            {member.status === "invited" ? (
              <div className="mb-4">
                <Banner tone="neutral">
                  아직 첫 로그인 전이에요. 강사가 임시 비밀번호로 접속하면 자동으로 활성화돼요.
                </Banner>
              </div>
            ) : null}

            {/* edit */}
            <div className="mb-2.5">
              <Kicker>정보 수정</Kicker>
            </div>
            <div className="flex flex-col gap-3.5">
              <Field icon="person" label="강사 이름">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field icon="phone" label="연락처">
                <TextInput
                  type="tel"
                  inputMode="tel"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
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
