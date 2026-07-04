"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, PhoneInput } from "@/components/ui/Field";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { addInstructor } from "@/lib/auth/trainer-actions";

export function StaffInviteClient() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    if (pending) return;
    setPending(true);
    const res = await addInstructor(name, phone);
    setPending(false);
    if (!res.ok || !res.id) {
      toast(res.error ?? "강사 등록에 실패했어요", "error");
      return;
    }
    toast("강사를 등록하고 로그인 계정을 발급했어요");
    router.push("/t/staff/" + res.id);
    router.refresh();
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-2 flex items-center gap-3">
          <BackButton fallback="/t/staff" />
          <span className="text-[19px] font-bold text-ink">강사 추가</span>
        </div>
        <p className="mb-6 text-[13.5px] leading-[1.6] text-muted2">
          이름과 전화번호를 등록하면 바로 로그인 계정이 발급돼요. 담당 배정도 지금 바로 할 수 있어요.
        </p>

        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="강사 이름">
            <PlainTextInput placeholder="이름" value={name} onChange={setName} className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder" />
          </Field>
          <Field icon="phone" label="전화번호 (로그인 아이디)">
            <PhoneInput placeholder="010-0000-0000" value={phone} onValueChange={setPhone} />
          </Field>
        </div>

        <div className="h-4" />
        <Banner tone="neutral">
          전화번호가 로그인 아이디가 돼요. 강사는 비밀번호 없이 전화번호로 첫 로그인한 뒤, 본인이 아이디·비밀번호를 설정해요.
        </Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton
          icon="person-plus"
          onClick={onSubmit}
          pending={pending}
          disabled={!name.trim() || phone.replace(/\D/g, "").length < 9}
        >
          강사 등록
        </PrimaryButton>
      </Footer>
    </div>
  );
}
