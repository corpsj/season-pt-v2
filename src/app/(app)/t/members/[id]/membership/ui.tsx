"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { RadioOption } from "@/components/ui/RadioOption";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { issueMembership } from "@/lib/data/groups/owner-ops-actions";
import type { MemberDetailView, MembershipProduct } from "@/lib/types";

export function MembershipClient({
  member,
  products,
}: {
  member: MemberDetailView;
  products: MembershipProduct[];
}) {
  const id = member.id;
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string>(products[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  async function onIssue() {
    if (pending) return;
    setPending(true);
    const res = await issueMembership(id, selected);
    if (!res.ok) {
      setPending(false);
      toast(res.error ?? "회원권 발급에 실패했어요");
      return;
    }
    router.push(`/t/payment?member=${id}`);
    router.refresh();
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback={`/t/members/${id}`} />
          <span className="text-[19px] font-bold text-ink">회원권 발급</span>
        </div>

        {/* member chip */}
        <div className="mb-6 flex items-center gap-2.5">
          <Avatar initial={member.initial} tone={member.avatarTone} size={36} />
          <span className="text-[14px] font-bold text-ink">{member.name}</span>
        </div>

        <div className="mb-2.5">
          <Kicker>회원권 상품</Kicker>
        </div>
        <div className="mb-6 flex flex-col gap-2.5">
          {products.map((p) => (
            <RadioOption
              key={p.id}
              selected={selected === p.id}
              onClick={() => setSelected(p.id)}
              right={
                <span className="flex-none text-[14px] font-bold text-ink">
                  ₩{p.price.toLocaleString()}
                </span>
              }
            >
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-ink">{p.name}</span>
              </span>
            </RadioOption>
          ))}
        </div>

        <Card className="flex items-center gap-2.5 px-[15px] py-[14px]">
          <Icon name="calendar" size={18} className="flex-none text-sage" />
          <span className="text-[13px] font-medium text-muted2">
            시작 6/22 · ~9/22 · 잔여 20회 자동 생성
          </span>
        </Card>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="ticket-fill" onClick={onIssue}>
          발급하고 결제 기록
        </PrimaryButton>
      </Footer>
    </div>
  );
}
