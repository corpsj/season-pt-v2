import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/icon";
import type { BadgeVariant } from "@/lib/types";
import type { MemberSentRequest, MemberSentStatus } from "@/lib/data/groups/member";

const STATUS_BADGE: Record<MemberSentStatus, BadgeVariant> = {
  pending: "awaiting",
  seen: "changeReq",
  accepted: "active",
  rejected: "cancelReq",
  expired: "cancelled",
};

export function MemberSentRequestsList({ requests }: { requests: MemberSentRequest[] }) {
  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => (
        <Card key={r.id} className="p-[16px]">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">{r.title}</span>
            <span className="text-[11.5px] font-medium text-muted">{r.ago}</span>
            <Badge variant={STATUS_BADGE[r.status]} className="ml-auto">
              {r.statusLabel}
            </Badge>
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
