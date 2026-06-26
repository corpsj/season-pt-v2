"use client";
import { useEffect, useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { markNoticesRead } from "@/lib/data/groups/member-actions";
import { cn } from "@/lib/cn";
import type { MemberNoticesView, NoticeTone } from "@/lib/types";

const TONE_TAG: Record<NoticeTone, string> = {
  important: "text-terracotta-deep bg-warm-banner",
  facility: "text-sage-deep bg-sage-banner2",
  ops: "text-muted bg-chip-soft",
};
const READ_TAG = "text-muted bg-chip-soft";

export function MemberNoticesClient({ view }: { view: MemberNoticesView }) {
  // Snapshot on mount so the unread highlight persists for this visit even after
  // markNoticesRead() re-renders the route. Cleared on the next open.
  const [notices] = useState(view.notices);

  // Mark currently-unread notices as read once this screen has been seen.
  useEffect(() => {
    if (view.unread > 0) void markNoticesRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">공지사항</span>
        </div>

        {notices.length === 0 ? (
          <EmptyState icon="megaphone-fill" title="아직 공지가 없어요" desc="새 공지가 올라오면 여기에 표시돼요." />
        ) : (
        <Card className="shrink-0 overflow-hidden">
          {notices.map((n, i) => (
            <div
              key={n.id}
              className={cn("flex gap-3 px-4 py-[17px]", n.unread && "bg-[#fbfbf6]", i > 0 && "border-t border-ink/[0.06]")}
            >
              <span className={cn("mt-[7px] h-[7px] w-[7px] flex-none rounded-full", n.unread && "bg-terracotta")} />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-md px-2 py-[3px] text-[10.5px] font-bold tracking-[0.01em]",
                      n.unread ? TONE_TAG[n.tone] : READ_TAG
                    )}
                  >
                    {n.tag}
                  </span>
                  <span className={cn("text-[11.5px] font-medium", n.unread ? "text-placeholder" : "text-chevron")}>
                    {n.dateLabel}
                  </span>
                </div>
                <div className={cn("mb-1 text-[14.5px]", n.unread ? "font-bold text-ink" : "font-semibold text-muted5")}>
                  {n.title}
                </div>
                <div className={cn("text-[12.5px] font-medium leading-[1.5]", n.unread ? "text-muted2" : "text-placeholder")}>
                  {n.body}
                </div>
              </div>
            </div>
          ))}
        </Card>
        )}
      </Body>
    </div>
  );
}
