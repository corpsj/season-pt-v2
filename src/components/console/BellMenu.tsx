"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { markConsoleNotifRead } from "@/lib/data/groups/console-actions";
import type { NotificationView } from "@/lib/data/groups/notifications";

export function BellMenu({ items, unread }: { items: NotificationView[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function read(id: string) {
    await markConsoleNotifRead(id);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="알림"
        className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-[rgba(75,59,46,0.07)] bg-white text-[#6B785E] transition active:scale-[.97]"
      >
        <Icon name="bell" size={20} />
        {unread > 0 ? (
          <span className="absolute right-[10px] top-[9px] h-[7px] w-[7px] rounded-full border-[1.6px] border-white bg-terracotta" />
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-50 mt-2 w-[330px] overflow-hidden rounded-[16px] border border-[rgba(75,59,46,0.08)] bg-white"
            style={{ boxShadow: "0 18px 48px -12px rgba(38,35,30,0.4)" }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(75,59,46,0.07)] px-[18px] py-3">
              <span className="text-[14px] font-bold text-ink">알림</span>
              {unread > 0 ? (
                <span className="rounded-full bg-[#FBF3E9] px-2 py-0.5 text-[11px] font-bold text-terracotta">
                  새 알림 {unread}
                </span>
              ) : null}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {items.length ? (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => read(n.id)}
                    className="flex w-full items-start gap-3 border-b border-[rgba(75,59,46,0.05)] px-[18px] py-3 text-left transition-colors hover:bg-[#FBFAF7]"
                  >
                    <span
                      className={`mt-1.5 h-[7px] w-[7px] flex-none rounded-full ${
                        n.status === "unread" ? "bg-terracotta" : "bg-[#D6CFC2]"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink">{n.title}</span>
                      {n.body ? <span className="mt-0.5 block text-[12px] text-[#9A917F]">{n.body}</span> : null}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-[18px] py-10 text-center">
                  <Icon name="bell" size={22} className="mx-auto mb-2 text-[#C2BAAD]" />
                  <div className="text-[13px] font-medium text-[#847A66]">새 알림이 없어요</div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
