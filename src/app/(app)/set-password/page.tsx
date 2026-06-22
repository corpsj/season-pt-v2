"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";

export default function SetPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  function submit() {
    toast("비밀번호가 설정되었어요");
    router.push("/t");
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="form">
        <div className="mb-6 flex items-center">
          <BackButton fallback="/login/instructor" />
        </div>

        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-sage-banner2">
          <Icon name="lock-fill" size={24} className="text-sage-deep" />
        </div>

        <h1 className="mt-4 text-[25px] font-bold tracking-[-0.01em] text-ink">비밀번호 설정</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-muted2">
          앞으로 로그인할 때 사용할 새 비밀번호를 정해요.
        </p>

        <div className="mt-7 flex flex-col gap-3.5">
          <Field icon="lock" label="새 비밀번호">
            <TextInput
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <Field icon="lock" label="새 비밀번호 확인">
            <TextInput
              type="password"
              placeholder="••••••••"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Icon name="circle-check-fill" size={17} className="flex-none text-sage" />
            <span className="text-[12.5px] font-medium text-muted2">8자 이상</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="circle-check-fill" size={17} className="flex-none text-sage" />
            <span className="text-[12.5px] font-medium text-muted2">영문과 숫자 포함</span>
          </div>
        </div>
      </Body>

      <Footer pad="form">
        <PrimaryButton icon="check-bold" onClick={submit}>
          비밀번호 설정 완료
        </PrimaryButton>
      </Footer>
    </div>
  );
}
