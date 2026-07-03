import Link from "next/link";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { getStaff } from "@/lib/data/groups/owner-ops";
import { requireOwnerPage } from "@/lib/auth/guard";
import type { BadgeVariant } from "@/lib/types";

export default async function StaffPage() {
  await requireOwnerPage(); // 대표 전용
  const staff = await getStaff();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/perf" />
          <span className="text-[19px] font-bold text-ink">강사 관리</span>
        </div>

        <div className="mb-4">
          <Banner tone="owner">강사는 이름만으로 먼저 등록하고, 로그인 아이디는 준비되면 강사 상세에서 발급해요.</Banner>
        </div>

        <div className="flex flex-col gap-2.5">
          {staff.map((s) => {
            const variant: BadgeVariant =
              s.role === "owner" ? "owner" : s.role === "invited" ? "invited" : "instructor";
            const text =
              s.role === "owner" ? "대표" : s.role === "invited" ? (s.hasLogin ? "초대 대기" : "계정 미발급") : "강사";
            return (
              <Link key={s.id} href={`/t/staff/${s.id}`}>
                <Card className="tappable flex items-center gap-3 px-[15px] py-[13px]">
                  <Avatar initial={s.initial} tone={s.avatarTone} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-ink">{s.name}</span>
                      <Badge variant={variant} icon={s.role === "owner" ? "crown-fill" : undefined}>
                        {text}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[12px] font-medium text-muted">{s.sub}</div>
                  </div>
                  <Icon name="chevron-right" size={15} className="flex-none text-chevron" />
                </Card>
              </Link>
            );
          })}
        </div>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton href="/t/staff/invite" icon="person-plus">
          강사 추가
        </PrimaryButton>
      </Footer>
    </div>
  );
}
