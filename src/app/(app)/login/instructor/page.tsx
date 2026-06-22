"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { trainerLogin } from "@/lib/auth/trainer-actions";

export default function InstructorLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await trainerLogin(id, pw);
      if (res.ok) {
        router.push("/set-password");
      } else {
        setError(res.error ?? "로그인에 실패했어요");
      }
    });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="form">
        <div className="mb-6 flex items-center">
          <BackButton fallback="/login/trainer" />
        </div>

        <h1 className="text-[25px] font-bold tracking-[-0.01em] text-ink">강사 첫 로그인</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-muted2">
          대표님께 받은 아이디와 임시 비밀번호를 입력해요.
        </p>

        <div className="mt-7 flex flex-col gap-3.5">
          <Field icon="person" label="아이디">
            <TextInput value={id} onChange={(e) => setId(e.target.value)} />
          </Field>
          <Field
            label="임시 비밀번호"
            rowClassName="border-terracotta/[0.25] bg-warm-banner"
          >
            <div className="flex items-center gap-2.5">
              <Icon name="lock" size={19} className="flex-none text-terracotta" />
              <input
                className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <Banner tone="warn" className="mt-4">
          임시 비밀번호로 로그인한 뒤, 본인만 아는 새 비밀번호를 설정해요.
        </Banner>

        {error ? (
          <p className="mt-3 text-[13px] font-medium text-terracotta">{error}</p>
        ) : null}
      </Body>

      <Footer pad="form">
        <PrimaryButton onClick={submit} disabled={pending}>
          로그인
        </PrimaryButton>
      </Footer>
    </div>
  );
}
