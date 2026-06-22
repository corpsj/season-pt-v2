"use client";
import { useState } from "react";
import { ICON_NAMES } from "@/components/ui/icon-data";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Stat, StatTriple } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { RadioOption } from "@/components/ui/RadioOption";
import { Stepper } from "@/components/ui/Stepper";
import { Field, TextInput } from "@/components/ui/Field";
import { ChatInput } from "@/components/ui/ChatInput";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { BarChart } from "@/components/ui/BarChart";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { BadgeVariant, BannerTone, CalendarDay } from "@/lib/types";

const BADGES: { v: BadgeVariant; t: string }[] = [
  { v: "active", t: "활성" },
  { v: "expiringNear", t: "D-3" },
  { v: "expiringSoon", t: "D-9" },
  { v: "changeReq", t: "변경 요청" },
  { v: "cancelReq", t: "취소 요청" },
  { v: "scheduled", t: "예정" },
  { v: "team", t: "2:1" },
  { v: "done", t: "완료" },
  { v: "cancelled", t: "취소" },
  { v: "awaiting", t: "응답 대기" },
  { v: "owner", t: "대표" },
  { v: "instructor", t: "강사" },
  { v: "invited", t: "초대 대기" },
  { v: "remaining", t: "잔여 3 · D-9" },
  { v: "recommended", t: "추천" },
];
const BANNERS: BannerTone[] = ["neutral", "warn", "positive", "team", "owner"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-sage-deep">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Catalog() {
  const toast = useToast();
  const cal: CalendarDay[] = Array.from({ length: 30 }, (_, i) => ({
    n: i + 1,
    dateISO: `2026-06-${String(i + 1).padStart(2, "0")}`,
    inMonth: true,
    isSunday: i % 7 === 0,
    hasDot: [2, 4, 6, 9, 12].includes(i + 1),
    selected: i + 1 === 21,
  }));
  const [seg, setSeg] = useState<"a" | "b">("a");
  const [radio, setRadio] = useState(0);
  const [kg, setKg] = useState(40);
  const [draft, setDraft] = useState("");

  return (
    <div className="relative mx-auto min-h-dvh max-w-[420px] bg-canvas px-5 py-8">
      <h1 className="mb-6 text-xl font-bold text-ink">계절 PT — 디자인 시스템 카탈로그</h1>

      <Section title={`Icons (${ICON_NAMES.length})`}>
        <Card className="grid grid-cols-6 gap-y-4 p-4 text-ink">
          {ICON_NAMES.map((n) => (
            <div key={n} className="flex flex-col items-center gap-1">
              <Icon name={n} size={22} />
              <span className="text-[7px] text-muted">{n}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Buttons">
        <PrimaryButton icon="check-bold" onClick={() => toast("기본 동작")}>
          주 버튼
        </PrimaryButton>
        <OutlineButton icon="pencil">보조 버튼</OutlineButton>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <Chip selected>전체</Chip>
          <Chip>활성</Chip>
          <Chip tone="expiring">만료 임박</Chip>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((b) => (
            <Badge key={b.v} variant={b.v}>
              {b.t}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Banners">
        {BANNERS.map((tone) => (
          <Banner key={tone} tone={tone}>
            {tone} 배너 — 안내 문구가 여기에 들어가요.
          </Banner>
        ))}
      </Section>

      <Section title="Avatars">
        <div className="flex items-center gap-3">
          <Avatar initial="이" tone="gold" />
          <Avatar initial="정" tone="sageMid" />
          <Avatar initial="박" tone="sage" />
          <TeamAvatar team={{ init1: "윤", tone1: "sage", init2: "강", tone2: "gold" }} />
        </div>
      </Section>

      <Section title="Stats">
        <StatTriple
          items={[
            { value: 24, label: "담당 회원" },
            { value: 3, label: "만료 임박", color: "text-terracotta" },
            { value: 2, label: "휴회", color: "text-muted" },
          ]}
        />
        <Card className="flex gap-2.5 p-3.5">
          <Stat value="84" label="수업 수" className="flex-1" />
          <Stat value="96%" label="출석률" color="text-sage-deep" className="flex-1" />
        </Card>
      </Section>

      <Section title="Calendar">
        <CalendarGrid monthLabel="2026년 6월" days={cal} firstWeekday={0} onPick={(d) => toast(d)} />
      </Section>

      <Section title="Bar chart">
        <Card className="p-4">
          <BarChart
            bars={[
              { label: "월", valuePx: 34, emphasized: false },
              { label: "화", valuePx: 50, emphasized: false },
              { label: "수", valuePx: 40, emphasized: false },
              { label: "목", valuePx: 56, emphasized: false },
              { label: "금", valuePx: 46, emphasized: false },
              { label: "토", valuePx: 60, emphasized: true },
            ]}
          />
        </Card>
      </Section>

      <Section title="Controls">
        <SegmentedToggle
          options={[
            { value: "a", label: "받은 요청 3" },
            { value: "b", label: "보낸 요청 1" },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <RadioOption selected={radio === 0} onClick={() => setRadio(0)} right={<span className="text-[12px] font-semibold text-sage-deep">기본</span>}>
          <span className="text-[14px] font-semibold text-ink">출석</span>
        </RadioOption>
        <RadioOption selected={radio === 1} onClick={() => setRadio(1)}>
          <span className="text-[14px] font-semibold text-ink">노쇼 (차감)</span>
        </RadioOption>
        <div className="flex gap-2.5">
          <Stepper value={kg} unit="kg" onDec={() => setKg((v) => v - 5)} onInc={() => setKg((v) => v + 5)} />
        </div>
        <Kicker>섹션 라벨</Kicker>
        <Field icon="person" label="아이디">
          <TextInput placeholder="gyeaul.master" />
        </Field>
      </Section>

      <Section title="Progress">
        <ProgressBar pct={60} />
      </Section>

      <Section title="Empty state">
        <Card className="p-4">
          <EmptyState icon="calendar" title="예정된 수업이 없어요" desc="이 날은 비어 있어요." />
        </Card>
      </Section>

      <Section title="Chat">
        <Card className="flex flex-col gap-2 p-4">
          <ChatBubble mine={false} sender="윤지아" text="코치님 다음 주 시간 조정 가능할까요?" time="오전 11:28" />
          <ChatBubble mine text="네 화요일 8시로 옮겨드릴게요." time="오전 11:30" />
        </Card>
        <Card className="overflow-hidden">
          <ChatInput value={draft} onChange={setDraft} onSend={() => toast(`전송: ${draft}`)} />
        </Card>
      </Section>
    </div>
  );
}

export default function DevPage() {
  return (
    <ToastProvider>
      <Catalog />
    </ToastProvider>
  );
}
