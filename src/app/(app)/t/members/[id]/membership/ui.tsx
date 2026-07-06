"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { RadioOption } from "@/components/ui/RadioOption";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { issueMembership } from "@/lib/data/groups/owner-ops-actions";
import { QUAD_TABS, matchesQuad, isUnclassified, isDiscountProduct, productShortLabel, type Quad } from "@/lib/data/product-class";
import type { MemberDetailView, MembershipProduct } from "@/lib/types";

// ponytail: date labels computed client-side from durationDays; no timezone edge cases matter here (display only)
function dateLabel(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600000 + offsetDays * 86400000); // KST
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${m}/${day}`;
}

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
  // 담당×유형 4탭 — 담당·자격 기반 자동 필터 없음(대표가 어느 탭 상품이든 발급 가능).
  const [productTab, setProductTab] = useState<Quad>("owner-1on1");
  const visible = useMemo(() => {
    const tab = QUAD_TABS.find((t) => t.key === productTab)!;
    return products.filter((p) => matchesQuad(p.name, tab) || isUnclassified(p.name));
  }, [products, productTab]);
  const [selected, setSelected] = useState<string>("");
  const [pending, setPending] = useState(false);

  // 필터로 선택 상품이 숨겨지면 첫 노출 상품으로 — 숨은 상품이 조용히 발급되는 것 방지.
  const effectiveSelected = visible.some((p) => p.id === selected) ? selected : visible[0]?.id ?? "";
  const selectedProductData = products.find((p) => p.id === effectiveSelected);

  async function onIssue() {
    if (pending || !effectiveSelected) return;
    setPending(true);
    const res = await issueMembership(id, effectiveSelected);
    if (!res.ok) {
      setPending(false);
      toast(res.error ?? "회원권 발급에 실패했어요", "error");
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
        {products.length > 0 ? (
          <SegmentedToggle
            className="mb-2.5"
            options={QUAD_TABS.map((t) => ({ value: t.key, label: t.label }))}
            value={productTab}
            onChange={setProductTab}
          />
        ) : null}
        <div className="mb-6 flex flex-col gap-2.5">
          {visible.map((p) => (
            <RadioOption
              key={p.id}
              selected={effectiveSelected === p.id}
              onClick={() => setSelected(p.id)}
              right={
                <span className="flex-none text-[14px] font-bold text-ink">
                  ₩{p.price.toLocaleString()}
                </span>
              }
            >
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-ink">{productShortLabel(p)}</span>
                {isDiscountProduct(p.name) ? (
                  <span className="flex-none rounded-md bg-gold-bg px-1.5 py-0.5 text-[10.5px] font-bold text-gold">특별할인</span>
                ) : null}
                {!p.active ? (
                  <span className="flex-none rounded-md bg-chip-soft px-1.5 py-0.5 text-[10.5px] font-bold text-muted2">단종 · 연장전용</span>
                ) : null}
              </span>
            </RadioOption>
          ))}
          {visible.length === 0 ? (
            <Card className="p-5 text-center text-[13px] text-muted">해당하는 상품이 없어요</Card>
          ) : null}
        </div>

        {selectedProductData && (
          <Card className="flex items-center gap-2.5 px-[15px] py-[14px]">
            <Icon name="calendar" size={18} className="flex-none text-sage" />
            <span className="text-[13px] font-medium text-muted2">
              {member.activeMembershipId ? (
                // 연장: 기존 잔여·유효기간에 누적된다.
                <>기존 잔여 {member.remaining}회 +{selectedProductData.sessions}회 = {member.remaining + selectedProductData.sessions}회 · 유효기간 +{selectedProductData.durationDays}일</>
              ) : (
                <>시작 {dateLabel()} · ~{dateLabel(selectedProductData.durationDays)} · 잔여 {selectedProductData.sessions}회 자동 생성</>
              )}
            </span>
          </Card>
        )}
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="ticket-fill" onClick={onIssue} pending={pending}>
          {member.activeMembershipId ? "연장하고 결제 기록" : "발급하고 결제 기록"}
        </PrimaryButton>
      </Footer>
    </div>
  );
}
