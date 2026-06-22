"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";

export default function MemberLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="form">
        <div className="mb-6 flex items-center">
          <BackButton fallback="/" />
        </div>

        <h1 className="text-[25px] font-bold tracking-[-0.01em] text-ink">회원 로그인</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-muted2">
          휴대폰 번호와 생년월일로 간편하게 로그인해요.
        </p>

        <div className="mt-7 flex flex-col gap-3.5">
          <Field icon="mobile" label="휴대폰 (아이디)">
            <TextInput
              type="tel"
              inputMode="numeric"
              placeholder="010-2345-6789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field icon="lock" label="생년월일 6자리 (비밀번호)" hint="YYMMDD">
            <TextInput
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </Field>
        </div>

        <Banner className="mt-4">
          처음 로그인할 땐 생년월일 6자리(YYMMDD)가 초기 비밀번호예요.
        </Banner>
      </Body>

      <Footer pad="form" className="flex flex-col gap-3">
        <PrimaryButton onClick={() => router.push("/m")}>로그인</PrimaryButton>
        <button
          type="button"
          className="tappable mx-auto text-[13px] font-medium text-sage-deep"
        >
          비밀번호 변경하기
        </button>
      </Footer>
    </div>
  );
}
