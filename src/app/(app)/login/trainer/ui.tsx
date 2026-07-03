"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { trainerLogin } from "@/lib/auth/trainer-actions";

/** showOwnerSignup: 아직 대표 계정이 없을 때만 대표 가입 진입점을 노출(부트스트랩 전용). */
export function TrainerLoginForm({ showOwnerSignup }: { showOwnerSignup: boolean }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await trainerLogin(id, pw);
      if (res.ok && res.mustChangePassword) {
        router.push("/set-password");
      } else if (res.ok) {
        router.push("/t");
        router.refresh();
      } else {
        setError(res.error ?? "로그인에 실패했어요");
      }
    });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="form">
        <div className="mb-6 flex items-center">
          <BackButton fallback="/" />
        </div>

        <h1 className="text-[25px] font-bold tracking-[-0.01em] text-ink">트레이너 로그인</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-muted2">
          발급받은 아이디와 비밀번호로 로그인해요.
        </p>

        <div className="mt-7 flex flex-col gap-3.5">
          <Field icon="person" label="아이디">
            <TextInput
              placeholder="season.master"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </Field>
          <Field icon="lock" label="비밀번호" hint="표시">
            <TextInput
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {showOwnerSignup ? (
            <Link
              href="/signup/owner"
              className="tappable flex items-center gap-2.5 rounded-[13px] border border-gold/30 bg-gold-bg px-4 py-[14px]"
            >
              <Icon name="crown-fill" size={18} className="flex-none text-gold" />
              <span className="flex-1 text-[13.5px] font-semibold text-ink">대표 회원가입 (최초 1회)</span>
              <Icon name="chevron-right" size={15} className="text-chevron" />
            </Link>
          ) : null}
          <Link
            href="/login/instructor"
            className="tappable flex items-center gap-2.5 rounded-[13px] border border-ink/[0.08] bg-card px-4 py-[14px]"
          >
            <Icon name="lock" size={18} className="flex-none text-sage" />
            <span className="flex-1 text-[13.5px] font-semibold text-ink">
              강사 첫 로그인 (임시 비밀번호)
            </span>
            <Icon name="chevron-right" size={15} className="text-chevron" />
          </Link>
        </div>

        {error ? (
          <p className="mt-4 text-[13px] font-medium text-terracotta">{error}</p>
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
