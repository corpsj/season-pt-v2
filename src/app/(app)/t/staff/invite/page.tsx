"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { inviteInstructor } from "@/lib/auth/trainer-actions";

export default function StaffInvitePage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [issued, setIssued] = useState<{ username: string; tempPassword: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    if (pending) return;
    setPending(true);
    const res = await inviteInstructor(name, phone);
    setPending(false);
    if (!res.ok || !res.username || !res.tempPassword) {
      toast(res.error ?? "강사 계정 발급에 실패했어요");
      return;
    }
    setIssued({ username: res.username, tempPassword: res.tempPassword });
    toast("강사 계정을 발급했어요");
    router.refresh();
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-2 flex items-center gap-3">
          <BackButton fallback="/t/staff" />
          <span className="text-[19px] font-bold text-ink">강사 초대</span>
        </div>
        <p className="mb-6 text-[13.5px] leading-[1.6] text-muted2">
          강사 정보를 입력하면 로그인 계정과 임시 비밀번호가 발급돼요.
        </p>

        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="강사 이름">
            <TextInput placeholder="정하늘" value={name} onChange={(e) => setName(e.target.value)} />
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

        <div className="mb-2.5 mt-6">
          <Kicker>발급되는 계정</Kicker>
        </div>
        <Card className="mb-4 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-[14px]">
            <Icon name="person" size={18} className="flex-none text-sage" />
            <span className="flex-1 text-[12.5px] font-semibold text-muted5">아이디</span>
            <span className="text-[14px] font-bold text-ink">{issued?.username ?? "gyeaul.haneul"}</span>
          </div>
          <div className="flex items-center gap-2.5 border-t border-ink/[0.07] px-4 py-[14px]">
            <Icon name="lock-fill" size={18} className="flex-none text-terracotta" />
            <span className="flex-1 text-[12.5px] font-semibold text-muted5">임시 비밀번호</span>
            <span className="text-[14px] font-bold text-ink">{issued?.tempPassword ?? "ptss-7390"}</span>
          </div>
        </Card>

        <Banner tone="neutral">강사가 첫 로그인 시 임시 비밀번호로 접속한 뒤 새 비밀번호를 설정해요.</Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton onClick={issued ? () => router.back() : onSubmit}>
          {issued ? "완료" : "강사 계정 발급"}
        </PrimaryButton>
      </Footer>
    </div>
  );
}
