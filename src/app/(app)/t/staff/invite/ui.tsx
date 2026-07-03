"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, PhoneInput, TextInput } from "@/components/ui/Field";
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
    toast("강사를 등록했어요");
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
          이름만 등록하면 바로 회원의 담당 강사로 지정할 수 있어요. 로그인 아이디는 준비되면 강사 상세에서 발급하세요.
        </p>

        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="강사 이름">
            <TextInput placeholder="정하늘" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field icon="phone" label="연락처 (선택)">
            <PhoneInput placeholder="010-0000-0000" value={phone} onValueChange={setPhone} />
          </Field>
        </div>

        <div className="h-4" />
        <Banner tone="neutral">
          로그인 계정 없이 명단에만 등록돼요. 강사가 앱을 쓸 준비가 되면 상세 화면에서 아이디·임시 비밀번호를 발급하세요.
        </Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="person-plus" onClick={onSubmit} pending={pending}>
          강사 등록
        </PrimaryButton>
      </Footer>
    </div>
  );
}
