"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, PhoneInput, TextInput } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { memberLogin } from "@/lib/auth/member-actions";

export default function MemberLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await memberLogin(phone, birth);
      if (res.ok) {
        router.push("/m");
        router.refresh();
      } else {
        setError(res.error ?? "로그인에 실패했어요");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="scr flex min-h-0 flex-1 flex-col"
    >
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
            <PhoneInput placeholder="010-2345-6789" value={phone} onValueChange={setPhone} />
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

        {error ? (
          <p className="mt-3 text-[13px] font-medium text-terracotta">{error}</p>
        ) : null}
      </Body>

      <Footer pad="form" className="flex flex-col gap-3">
        <PrimaryButton type="submit" pending={pending}>
          로그인
        </PrimaryButton>
        <p className="mx-auto text-[12.5px] font-medium text-muted2">
          비밀번호는 로그인 후 마이페이지에서 변경할 수 있어요.
        </p>
      </Footer>
    </form>
  );
}
