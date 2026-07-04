"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, PhoneInput } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { trainerFirstLogin } from "@/lib/auth/trainer-actions";

export default function InstructorLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await trainerFirstLogin(phone);
      if (res.ok) {
        router.push("/set-password");
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
          <BackButton fallback="/login/trainer" />
        </div>

        <h1 className="text-[25px] font-bold tracking-[-0.01em] text-ink">강사 첫 로그인</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-muted2">
          대표님께 등록된 본인 전화번호를 입력하면 로그인돼요.
        </p>

        <div className="mt-7 flex flex-col gap-3.5">
          <Field icon="phone" label="전화번호">
            <PhoneInput placeholder="010-0000-0000" value={phone} onValueChange={setPhone} />
          </Field>
        </div>

        <Banner tone="warn" className="mt-4">
          비밀번호 없이 전화번호만으로 로그인해요. 로그인 후 본인만 아는 아이디·비밀번호를 설정해요.
        </Banner>

        {error ? (
          <p className="mt-3 text-[13px] font-medium text-terracotta">{error}</p>
        ) : null}
      </Body>

      <Footer pad="form">
        <PrimaryButton type="submit" pending={pending}>
          로그인
        </PrimaryButton>
      </Footer>
    </form>
  );
}
