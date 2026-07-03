"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Icon, type IconName } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { trainerLogout } from "@/lib/auth/trainer-actions";
import type { Me } from "@/lib/types";

type Row = {
  icon: IconName;
  label: string;
  sub: string;
  href: string;
  emphasized?: boolean;
};

export function SettingsClient({ me }: { me: Me }) {
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const rows: Row[] = [
    { icon: "persons", label: "강사 관리", sub: "강사 초대·권한 관리", href: "/t/staff", emphasized: true },
    { icon: "person-plus", label: "회원 등록", sub: "신규 회원 추가", href: "/t/members/register" },
    { icon: "ticket-fill", label: "회원권 상품", sub: "상품 카탈로그 관리", href: "/t/settings/products" },
    { icon: "tag-fill", label: "운동 종목", sub: "종목 목록 관리", href: "/t/settings/exercises" },
    { icon: "tune", label: "노쇼·취소 정책", sub: "차감·환불 기준", href: "/t/settings/policy" },
    { icon: "megaphone", label: "공지사항", sub: "회원 앱 공지 작성", href: "/t/settings/notices" },
    { icon: "bell", label: "알림 설정", sub: "알림톡·푸시 발송", href: "/t/settings/notifications" },
  ];

  const initial = me.name.charAt(0) || "계";

  async function onLogoutConfirm() {
    setLogoutOpen(false);
    await trainerLogout();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t" />
          <span className="text-[19px] font-bold text-ink">설정</span>
        </div>

        {/* profile card */}
        <Card className="mb-6 flex items-center gap-3 p-4">
          <Avatar initial={initial} tone="sage" size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-ink">{me.name}</span>
              <Badge variant={me.isOwner ? "owner" : "instructor"} icon={me.isOwner ? "crown-fill" : undefined}>
                {me.isOwner ? "대표" : "강사"}
              </Badge>
            </div>
            <div className="mt-0.5 text-[12.5px] font-medium text-muted">계절 PT & 필라테스</div>
          </div>
        </Card>

        {/* owner operations */}
        {me.isOwner ? (
          <>
            <div className="mb-2.5">
              <Kicker>운영 관리 · 대표 전용</Kicker>
            </div>
            <Card className="mb-6 shrink-0 overflow-hidden">
              {rows.map((r, i) => (
                <Link
                  key={r.label}
                  href={r.href}
                  className={`tappable flex items-center gap-3 px-4 py-[14px] ${
                    i > 0 ? "border-t border-ink/[0.07]" : ""
                  }`}
                >
                  <RowInner row={r} />
                </Link>
              ))}
            </Card>
          </>
        ) : (
          <div className="mb-6">
            <Banner tone="neutral">운영 메뉴는 대표만 사용할 수 있어요.</Banner>
          </div>
        )}

        {/* account */}
        <div className="mb-2.5">
          <Kicker>계정</Kicker>
        </div>
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="tappable flex w-full items-center gap-3 rounded-[13px] bg-warm-banner px-4 py-[14px] text-left"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-card text-terracotta">
            <Icon name="login" size={18} />
          </span>
          <span className="flex-1 text-[13.5px] font-bold text-terracotta-deep">로그아웃</span>
          <Icon name="chevron-right" size={15} className="text-terracotta" />
        </button>
        <div className="h-3.5" />
      </Body>

      <ConfirmDialog
        open={logoutOpen}
        title="로그아웃할까요?"
        confirmLabel="로그아웃"
        tone="warn"
        onConfirm={onLogoutConfirm}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}

function RowInner({ row }: { row: Row }) {
  return (
    <>
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
          row.emphasized ? "bg-sage-banner2 text-sage-deep" : "bg-chip-soft text-sage"
        }`}
      >
        <Icon name={row.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-bold ${row.emphasized ? "text-sage-deep" : "text-ink"}`}>
          {row.label}
        </span>
        <span className="mt-0.5 block text-[12px] font-medium text-muted">{row.sub}</span>
      </span>
      <Icon name="chevron-right" size={15} className="flex-none text-chevron" />
    </>
  );
}
