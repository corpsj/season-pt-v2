import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { MemberSentRequest, MemberSentStatus } from "@/lib/data/groups/member";

const STATUS_STYLE: Record<MemberSentStatus, string> = {
  pending: "bg-chip-soft text-muted",
  seen: "bg-sage-banner2 text-sage-deep",
  accepted: "bg-sage text-surface",
  rejected: "bg-warm-banner text-terracotta",
  expired: "bg-chip-soft text-placeholder",
};

export function MemberSentRequestsList({ requests }: { requests: MemberSentRequest[] }) {
  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => (
        <Card key={r.id} className="p-[16px]">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">{r.title}</span>
            <span className="text-[11.5px] font-medium text-muted">{r.ago}</span>
            <span
              className={cn(
                "ml-auto rounded-md px-2 py-0.5 text-[11px] font-bold",
                STATUS_STYLE[r.status],
              )}
            >
              {r.statusLabel}
            </span>
          </div>
          {r.originalLabel ? (
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted2">
              <Icon name="calendar" size={14} className="flex-none text-muted3" />
              <span>{r.originalLabel}</span>
            </div>
          ) : null}
          {r.proposedLabel ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-sage-deep">
              <Icon name="chevron-right" size={14} className="flex-none" />
              <span>{r.proposedLabel}</span>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
