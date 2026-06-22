"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Avatar } from "@/components/ui/Avatar";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { getInbox } from "@/lib/data";

type Tab = "received" | "sent";

export default function InboxPage() {
  const view = getInbox();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("received");

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-2.5">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">일정 조율</span>
          {view.receivedCount > 0 ? (
            <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-terracotta px-1.5 text-[11px] font-bold text-surface">
              {view.receivedCount}
            </span>
          ) : null}
        </div>

        <SegmentedToggle<Tab>
          className="mb-4"
          value={tab}
          onChange={setTab}
          options={[
            { value: "received", label: `받은 요청 ${view.receivedCount}` },
            { value: "sent", label: `보낸 요청 ${view.sentCount}` },
          ]}
        />

        {tab === "received" ? (
          view.received.length === 0 ? (
            <EmptyState
              icon="circle-check"
              tone="green"
              title="받은 요청이 없어요"
              desc="회원이 보낸 변경·취소 요청이 여기에 표시돼요."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {view.received.map((item) => (
                <Card key={item.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar initial={item.initial} tone={item.avatarTone} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-ink">{item.name}</span>
                        <span className="text-[12px] text-muted">{item.ago}</span>
                      </div>
                    </div>
                    <Badge variant={item.type === "change" ? "changeReq" : "cancelReq"}>
                      {item.type === "change" ? "변경 요청" : "취소 요청"}
                    </Badge>
                  </div>

                  {item.type === "change" ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-[10px] bg-sage-banner px-3 py-2 text-[12.5px] font-semibold text-muted6 line-through">
                        {item.before}
                      </span>
                      <Icon name="chevron-right" size={15} className="flex-none text-chevron" />
                      <span className="rounded-[10px] bg-sage-banner2 px-3 py-2 text-[12.5px] font-bold text-sage-deep">
                        {item.after}
                      </span>
                    </div>
                  ) : (
                    <Banner tone="warn" className="mt-3">
                      {item.reason}
                    </Banner>
                  )}

                  <div className="mt-3.5 flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => toast("요청을 거절했어요")}
                      className="tappable flex-1 rounded-[10px] border border-ink/10 bg-card py-2.5 text-[12.5px] font-bold text-ink"
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.type === "change") router.push("/confirm");
                        else toast("요청을 처리했어요");
                      }}
                      className="tappable flex-1 rounded-[10px] bg-sage py-2.5 text-[12.5px] font-bold text-surface"
                    >
                      수락
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            {view.sent.map((s) => (
              <Card key={s.id} className="p-3.5">
                <div className="flex items-center gap-3">
                  <Avatar initial={s.name.slice(0, 1)} tone="gold" size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-ink">{s.name}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{s.summary}</div>
                  </div>
                  <Badge variant="awaiting">응답 대기</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
