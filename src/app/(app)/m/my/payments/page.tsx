import Image from "next/image";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { getMemberPayments } from "@/lib/data/groups/member";

const won = (n: number) => n.toLocaleString("ko-KR");

export default async function MemberPaymentsPage() {
  const view = await getMemberPayments();

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* top bar */}
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">결제·구매 내역</span>
        </div>

        {view.totalCount === 0 ? (
          <EmptyState icon="coins" title="결제 내역이 없어요" />
        ) : (
          <>
            {/* cumulative summary */}
            <div className="relative mb-[22px] flex shrink-0 items-center justify-between overflow-hidden rounded-[18px] bg-sage px-5 py-[18px]">
              <Image
                src="/brand/brand-mark.png"
                alt=""
                aria-hidden
                width={200}
                height={200}
                className="pointer-events-none absolute -bottom-[104px] -right-[60px] select-none"
                style={{ opacity: 0.12, filter: "brightness(0) invert(1)" }}
              />
              <div className="relative">
                <div className="mb-[5px] whitespace-nowrap text-[12px] font-semibold tracking-[0.02em] text-[#d7dccf]">
                  누적 결제 금액
                </div>
                <div className="flex items-end gap-[3px] whitespace-nowrap">
                  <span className="serif text-[34px] font-semibold leading-[0.8] text-surface">{won(view.totalAmount)}</span>
                  <span className="pb-[3px] text-[14px] font-semibold text-[#e7dcc5]">원</span>
                </div>
              </div>
              <div className="relative text-right">
                <div className="whitespace-nowrap text-[16px] font-bold text-surface">{view.totalCount}건</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-[#cbd2be]">전체 결제</div>
              </div>
            </div>

            {/* per-year groups */}
            {view.years.map((y) => (
              <div key={y.year}>
                <div className="mx-0.5 mb-2.5 flex items-center gap-2">
                  <span className="text-[14px] font-bold text-ink">{y.year}</span>
                  <span className="whitespace-nowrap text-[12px] font-medium text-placeholder">{y.count}건</span>
                </div>
                <Card className="mb-[18px] px-4 py-0.5">
                  {y.items.map((it, i) => (
                    <div
                      key={it.id}
                      className={cn("flex items-center gap-[13px] py-[15px]", i > 0 && "border-t border-ink/[0.06]")}
                    >
                      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-sage-banner2 text-sage-deep">
                        <Icon name="ticket-fill" size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14.5px] font-semibold text-ink">{it.productLabel}</div>
                        <div className="mt-[3px] text-[12px] font-medium text-muted">{it.dateLabel}</div>
                      </div>
                      <div className="text-right">
                        <div className="whitespace-nowrap text-[14.5px] font-bold text-ink">
                          {it.amount != null ? `${won(it.amount)}원` : "—"}
                        </div>
                        <div
                          className={cn(
                            "mt-[3px] text-[11px] font-semibold",
                            it.done ? "text-sage-deep" : "text-placeholder"
                          )}
                        >
                          {it.statusLabel}
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            ))}

            <Banner tone="warn" className="mb-6">
              결제 영수증·증빙이 필요하면 담당 트레이너에게 메시지로 요청해 주세요.
            </Banner>
          </>
        )}
      </Body>
    </div>
  );
}
