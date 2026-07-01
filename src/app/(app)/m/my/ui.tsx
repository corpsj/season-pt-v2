"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Field, TextInput } from "@/components/ui/Field";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { memberTabs } from "@/components/trainer/tabs";
import { memberLogout, changeMemberPassword } from "@/lib/auth/member-actions";
import { cn } from "@/lib/cn";
import type { MemberMyView } from "@/lib/types";

const APP_VERSION = "1.0.0";

export function MemberMyClient({ view, chatUnread, notifUnread }: { view: MemberMyView; chatUnread: number; notifUnread: number }) {
  const router = useRouter();
  const toast = useToast();
  const m = view.membership;
  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pending, startTransition] = useTransition();

  async function onLogout() {
    await memberLogout();
    router.push("/");
    router.refresh();
  }

  function savePassword() {
    startTransition(async () => {
      const r = await changeMemberPassword(cur, next);
      if (r.ok) {
        setPwOpen(false);
        setCur("");
        setNext("");
        toast("비밀번호를 변경했어요");
      } else toast(r.error ?? "변경에 실패했어요");
    });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* title row */}
        <div className="mb-4 flex items-center justify-between px-0.5">
          <span className="whitespace-nowrap text-[22px] font-bold tracking-[-0.02em] text-ink">마이페이지</span>
          <Link
            href="/m/my/notifications"
            aria-label="알림 설정"
            className="tappable flex h-10 w-10 items-center justify-center rounded-xl border border-ink/[0.07] bg-card text-sage-deep"
          >
            <Icon name="setting" size={21} />
          </Link>
        </div>

        {/* profile hero */}
        <div className="relative mb-4 shrink-0 overflow-hidden rounded-[22px] bg-sage px-[22px] pb-5 pt-[22px]">
          <Image
            src="/brand/brand-mark.png"
            alt=""
            aria-hidden
            width={268}
            height={268}
            className="pointer-events-none absolute -bottom-[92px] -right-[92px] select-none"
            style={{ opacity: 0.13, filter: "brightness(0) invert(1)" }}
          />
          <div className="relative flex items-center gap-[15px]">
            <div
              className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-surface text-[23px] font-semibold text-sage-deep"
              style={{ border: "2.5px solid rgba(250,248,244,.5)" }}
            >
              {view.initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[7px] whitespace-nowrap">
                <span className="text-[21px] font-bold tracking-[-0.01em] text-surface">{view.name}</span>
                <span className="text-[12px] font-semibold text-[#3e4a33]">님</span>
              </div>
              <div className="mt-[7px] inline-flex items-center gap-1.5 rounded-lg bg-surface/[0.18] px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#cbd2be]" />
                <span className="text-[12px] font-bold tracking-[0.02em] text-surface">{view.statusLabel}</span>
              </div>
            </div>
          </div>

          {/* stats */}
          <div className="relative mt-[18px] flex border-t border-surface/20 pt-4">
            {view.stats.map((s, i) => (
              <div key={s.label} className="flex flex-1 items-stretch">
                {i > 0 ? <span className="w-px flex-none bg-surface/20" /> : null}
                <div className="flex-1 text-center">
                  <div className="text-[18px] font-bold text-surface">
                    {s.value}
                    <span className="text-[12px] font-semibold text-[#d7dccf]">{s.unit}</span>
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-[#cbd2be]">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* membership summary */}
        {m ? (
          <Card className="mb-[18px] p-[18px]">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 whitespace-nowrap">
                <Icon name="ticket-fill" size={20} className="text-sage-deep" />
                <span className="text-[15px] font-bold text-ink">{m.productLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => toast("재등록은 선생님에게 메시지로 문의해 주세요")}
                className="tappable flex items-center gap-0.5 whitespace-nowrap text-[13px] font-bold text-terracotta"
              >
                재등록
                <Icon name="chevron-right" size={15} />
              </button>
            </div>
            <div className="mb-3 flex items-end justify-between">
              <div className="flex items-end gap-[5px]">
                <span className="whitespace-nowrap pb-[9px] text-[13px] font-medium text-muted">잔여</span>
                <span className="serif text-[46px] font-semibold leading-[0.8] text-sage-deep">{m.remaining}</span>
                <span className="pb-[5px] text-[16px] font-semibold text-muted2">/ {m.total}회</span>
              </div>
              <span className="rounded-lg bg-sage-banner2 px-2.5 py-[5px] text-[12px] font-bold text-sage-deep">
                {m.expired ? "만료" : `D-${m.dDay}`}
              </span>
            </div>
            <ProgressBar pct={m.barPct} track="bg-[#efebe2]" fill="bg-sage" className="mb-[9px]" />
            <div className="text-[12.5px] font-medium text-muted">유효기간 {m.endLabel} 까지</div>
          </Card>
        ) : (
          <Card className="mb-[18px] flex items-center gap-3 p-[18px]">
            <Icon name="ticket-fill" size={20} className="flex-none text-placeholder" />
            <span className="text-[13.5px] font-medium text-muted">이용 중인 회원권이 없어요</span>
          </Card>
        )}

        {/* assigned trainer */}
        {view.trainer ? (
          <>
            <Kicker className="mx-1 mb-[9px]">내 담당 선생님</Kicker>
            <Card className="mb-[18px] flex items-center gap-[13px] px-4 py-3.5">
              <div
                className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-sage-banner2 text-[17px] font-semibold text-[#5e6b51]"
                style={{ border: "1px solid rgba(107,120,94,.18)" }}
              >
                {view.trainer.name.length > 1 ? view.trainer.name.slice(1, 3) : view.trainer.name}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-[15px] font-bold text-ink">{view.trainer.name}</span>
                  <Icon name="verified-check-fill" size={15} className="text-sage" />
                </div>
                <div className="mt-0.5 truncate text-[12.5px] font-medium text-muted">{view.trainer.sub}</div>
              </div>
              <Link
                href="/m/chat"
                className="tappable flex flex-none items-center gap-1.5 rounded-[10px] border-[1.5px] border-sage-deep/40 px-[13px] py-2 text-[12.5px] font-bold text-sage-deep"
              >
                <Icon name="message" size={15} />
                메시지
              </Link>
            </Card>
          </>
        ) : null}

        {/* menu · 내 활동 */}
        <Kicker className="mx-1 mb-[9px]">내 활동</Kicker>
        <Card className="mb-[18px] shrink-0 overflow-hidden">
          <MenuRow icon="coins-fill" label="결제·구매 내역" href="/m/my/payments" first />
          <MenuRow icon="document-text" label="운동 기록" href="/m/my/records" />
          <MenuRow icon="camera" label="체형 기록" href="/m/my/body" />
          <MenuRow icon="bell-fill" label="알림" href="/m/my/notifications/feed" badge={notifUnread} />
          <MenuRow icon="setting" label="알림 설정" href="/m/my/notifications" />
          <MenuRow icon="megaphone-fill" label="공지사항" href="/m/my/notices" badge={view.unreadNotices} />
        </Card>

        {/* menu · 고객지원 */}
        <Kicker className="mx-1 mb-[9px]">고객지원</Kicker>
        <Card className="mb-4 shrink-0 overflow-hidden">
          <MenuRow icon="lock" label="비밀번호 변경" onClick={() => setPwOpen(true)} first />
          <MenuRow icon="document-text" label="이용약관·정책" href="/m/my/policy" />
          <MenuRow icon="login" label="로그아웃" onClick={onLogout} />
        </Card>

        {/* footer */}
        <div className="px-0 pb-[22px] pt-1 text-center">
          <button
            type="button"
            onClick={() => toast("회원 탈퇴는 선생님에게 문의해 주세요")}
            className="tappable text-[12.5px] font-medium text-placeholder underline underline-offset-[3px]"
          >
            회원 탈퇴
          </button>
          <div className="mt-2 text-[11px] font-medium text-chevron">앱 버전 {APP_VERSION}</div>
        </div>
      </Body>

      {pwOpen && (
        <div
          onClick={() => setPwOpen(false)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(38,35,30,0.42)] sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-[20px] bg-card p-5 sm:rounded-[20px]"
          >
            <div className="mb-1 text-[16px] font-bold text-ink">비밀번호 변경</div>
            <p className="mb-3.5 text-[12.5px] text-muted">처음 비밀번호는 생년월일 6자리예요.</p>
            <div className="flex flex-col gap-3">
              <Field icon="lock" label="현재 비밀번호">
                <TextInput type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="현재 비밀번호" />
              </Field>
              <Field icon="lock" label="새 비밀번호">
                <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="4자 이상" />
              </Field>
            </div>
            <div className="mt-4 flex gap-2.5">
              <OutlineButton onClick={() => setPwOpen(false)} className="flex-1">
                취소
              </OutlineButton>
              <PrimaryButton onClick={savePassword} disabled={pending} className="flex-1">
                변경
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      <TabBar tabs={memberTabs({ chatUnread })} liveChat />
    </div>
  );
}

function MenuRow({
  icon,
  label,
  href,
  onClick,
  badge,
  first,
}: {
  icon: IconName;
  label: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
  first?: boolean;
}) {
  const inner = (
    <>
      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-chip-soft text-sage-deep">
        <Icon name={icon} size={19} />
      </span>
      <span className="flex-1 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-ink">{label}</span>
      {badge ? (
        <span className="mr-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-[5px] text-[11px] font-bold text-surface">
          {badge}
        </span>
      ) : null}
      <Icon name="chevron-right" size={19} className="text-chevron" />
    </>
  );
  const cls = cn("tappable flex w-full items-center gap-[13px] px-4 py-[15px] text-left", !first && "border-t border-ink/[0.06]");
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
