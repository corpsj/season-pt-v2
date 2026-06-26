"use client";
import { useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { markNotifRead } from "@/lib/data/groups/member-actions";
import { cn } from "@/lib/cn";
import type { NotificationView } from "@/lib/data/groups/notifications";

function shortDate(iso: string): string {
  return iso.slice(5, 7) + "." + iso.slice(8, 10);
}

export function MemberNotifFeedClient({ items }: { items: NotificationView[] }) {
  const [list, setList] = useState(items);

  async function tap(id: string) {
    setList((prev) => prev.map((it) => (it.id === id && it.status === "unread" ? { ...it, status: "read" } : it)));
    void markNotifRead(id);
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">알림</span>
        </div>

        {list.length > 0 ? (
          <Card className="shrink-0 overflow-hidden">
            {list.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onClick={() => tap(n.id)}
                className={cn(
                  "flex w-full gap-3 px-4 py-[17px] text-left",
                  n.status === "unread" && "bg-[#fbfbf6]",
                  i > 0 && "border-t border-ink/[0.06]"
                )}
              >
                <span
                  className={cn(
                    "mt-[7px] h-[7px] w-[7px] flex-none rounded-full",
                    n.status === "unread" ? "bg-terracotta" : "bg-transparent"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[14.5px]",
                        n.status === "unread" ? "font-bold text-ink" : "font-semibold text-muted5"
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[11.5px] font-medium text-chevron">
                      {shortDate(n.createdAt)}
                    </span>
                  </div>
                  {n.body ? (
                    <div
                      className={cn(
                        "text-[12.5px] font-medium leading-[1.5]",
                        n.status === "unread" ? "text-muted2" : "text-placeholder"
                      )}
                    >
                      {n.body}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </Card>
        ) : (
          <EmptyState icon="bell" title="알림이 없어요" desc="새 알림이 오면 여기에 표시돼요." />
        )}
      </Body>
    </div>
  );
}
