"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import type { Gender } from "@/lib/types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_OPTIONS = [18, 19, 20, 21];

export default function MemberRegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [days, setDays] = useState<Set<number>>(new Set([3, 6]));
  const [timeIdx, setTimeIdx] = useState(1); // 19시

  function toggleDay(i: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function cycleTime() {
    setTimeIdx((i) => (i + 1) % TIME_OPTIONS.length);
  }

  const regTime = `${TIME_OPTIONS[timeIdx]}시`;
  const selectedDays = [...days].sort((a, b) => a - b).map((d) => DAYS[d]);
  const regSummary =
    selectedDays.length > 0 ? `${regTime} · 매주 ${selectedDays.join("·")}` : `${regTime} · 요일을 선택해 주세요`;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/settings" />
          <span className="text-[19px] font-bold text-ink">회원 등록</span>
        </div>

        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="이름">
            <TextInput placeholder="윤서아" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field icon="phone" label="연락처 (아이디)">
            <TextInput
              type="tel"
              inputMode="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field icon="lock" label="생년월일 (초기 비밀번호)" hint="YYMMDD">
            <TextInput
              inputMode="numeric"
              placeholder="000000"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </Field>

          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">성별</div>
            <SegmentedToggle
              options={[
                { value: "female", label: "여성" },
                { value: "male", label: "남성" },
              ]}
              value={gender}
              onChange={setGender}
            />
          </div>

          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">담당 트레이너</div>
            <button
              type="button"
              onClick={() => toast("담당 트레이너 선택은 준비 중이에요")}
              className="tappable flex w-full items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-4 py-[15px] text-left"
            >
              <Icon name="person" size={19} className="flex-none text-sage-soft" />
              <span className="flex-1 text-[15px] font-medium text-ink">김계절</span>
              <Icon name="chevron-down" size={16} className="flex-none text-chevron" />
            </button>
          </div>
        </div>

        <div className="mb-2.5 mt-6">
          <Kicker>정기 수업 요일</Kicker>
        </div>
        <div className="mb-3 flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = days.has(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i)}
                className={`tappable flex-1 rounded-[11px] py-[10px] text-center text-[13px] font-bold ${
                  on
                    ? "bg-sage text-surface"
                    : i === 0
                      ? "bg-sage-banner text-sunday font-semibold"
                      : "bg-sage-banner text-muted5 font-semibold"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={cycleTime}
          className="tappable mb-4 flex w-full items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-4 py-[15px] text-left"
        >
          <Icon name="clock" size={19} className="flex-none text-sage-soft" />
          <span className="flex-1 text-[14px] font-medium text-ink">{regSummary}</span>
          <Icon name="refresh" size={16} className="flex-none text-chevron" />
        </button>

        <Banner tone="neutral">매주 같은 요일·시간에 수업이 자동 생성돼요.</Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton
          icon="person-plus"
          onClick={() => {
            toast("회원을 등록했어요");
            router.push("/t");
          }}
        >
          회원 등록
        </PrimaryButton>
      </Footer>
    </div>
  );
}
