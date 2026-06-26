import { redirect } from "next/navigation";
import { getTrainerContext } from "@/lib/auth/context";
import { getNotifications, markNotificationRead } from "@/lib/data/groups/notifications";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

function shortDate(iso: string): string {
  return iso.slice(5, 7) + "." + iso.slice(8, 10);
}

export default async function TrainerNotifsPage() {
  const t = await getTrainerContext();
  if (!t) redirect("/t");

  const items = await getNotifications("trainer", t.id);
  const unread = items.filter((n) => n.status === "unread");
  if (unread.length > 0) {
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/t" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">알림</span>
        </div>

        {items.length > 0 ? (
          <Card className="shrink-0 overflow-hidden">
            {items.map((n, i) => (
              <div
                key={n.id}
                className={cn(
                  "flex gap-3 px-4 py-[17px]",
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
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState icon="bell" title="알림이 없어요" desc="새 알림이 오면 여기에 표시돼요." />
        )}
      </Body>
    </div>
  );
}
