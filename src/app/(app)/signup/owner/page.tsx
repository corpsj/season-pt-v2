"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { ownerSignup } from "@/lib/auth/trainer-actions";

export default function OwnerSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const matched = pw.length > 0 && pw === pw2;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("이름을 입력해주세요");
      return;
    }
    if (!matched) {
      setError("비밀번호가 일치하지 않아요");
      return;
    }
    startTransition(async () => {
      const res = await ownerSignup(id, pw, name);
      if (res.ok) {
        router.push("/t");
        router.refresh();
      } else {
        setError(res.error ?? "가입에 실패했어요");
      }
    });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body pad="form">
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/login/trainer" />
          <span className="text-[19px] font-bold text-ink">대표 가입</span>
        </div>

        <Banner tone="owner" icon="crown-fill">
          대표 트레이너는 강사 관리·회원 등록·회원권 발급 등 운영 메뉴를 모두 사용할 수 있어요.
        </Banner>

        <div className="mt-5 flex flex-col gap-3.5">
          <Field icon="person" label="이름">
            <TextInput
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field icon="person" label="아이디">
            <TextInput
              placeholder="season.master"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </Field>
          <Field icon="lock" label="비밀번호">
            <TextInput
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <Field
            icon="lock"
            label="비밀번호 확인"
            hint={
              matched ? <Icon name="check-bold" size={17} className="text-sage" /> : undefined
            }
          >
            <TextInput
              type="password"
              placeholder="••••••••"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </Field>
        </div>

        <Banner tone="positive" icon="lock-fill" className="mt-5">
          입력하신 비밀번호는 <b>암호화되어 안전하게 저장</b>돼요. 안심하고 가입하세요.
        </Banner>

        {error ? (
          <p className="mt-4 text-[13px] font-medium text-terracotta">{error}</p>
        ) : null}
      </Body>

      <Footer pad="form">
        <PrimaryButton onClick={submit} pending={pending}>
          대표로 시작하기
        </PrimaryButton>
      </Footer>
    </div>
  );
}
