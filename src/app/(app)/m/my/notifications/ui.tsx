"use client";
import { useState } from "react";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { setMemberNotifSetting } from "@/lib/data/groups/member-actions";
import { cn } from "@/lib/cn";
import type { MemberNotifView } from "@/lib/types";

export function MemberNotifClient({ view }: { view: MemberNotifView }) {
  const toast = useToast();
  const [groups, setGroups] = useState(view.groups);

  async function toggle(key: string, next: boolean) {
    // optimistic
    setGroups((prev) =>
      prev.map((g) => ({ ...g, items: g.items.map((it) => (it.key === key ? { ...it, on: next } : it)) }))
    );
    const res = await setMemberNotifSetting(key, next);
    if (!res.ok) {
      // revert on failure
      setGroups((prev) =>
        prev.map((g) => ({ ...g, items: g.items.map((it) => (it.key === key ? { ...it, on: !next } : it)) }))
      );
      toast(res.error ?? "설정을 바꾸지 못했어요");
    }
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">알림 설정</span>
        </div>

        {groups.map((g) => (
          <div key={g.title}>
            <Kicker className="mx-1 mb-[9px]">{g.title}</Kicker>
            <Card className="mb-[18px] shrink-0 overflow-hidden">
              {g.items.map((it, i) => (
                <div
                  key={it.key}
                  className={cn("flex items-center gap-3 p-4", i > 0 && "border-t border-ink/[0.06]", !it.ready && "opacity-60")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold text-ink">{it.title}</div>
                    <div className="mt-[3px] text-[12px] font-medium text-muted">{it.sub}</div>
                  </div>
                  {it.ready ? (
                    <Switch on={it.on} onChange={(next) => toggle(it.key, next)} label={it.title} />
                  ) : (
                    <span className="flex-none rounded-md bg-chip-soft px-2 py-[5px] text-[11px] font-semibold text-placeholder">
                      준비 중
                    </span>
                  )}
                </div>
              ))}
            </Card>
          </div>
        ))}

        <Banner tone="neutral" className="mb-6">
          회원권 알림(만료·잔여)은 켜고 끌 수 있어요. ‘준비 중’ 항목은 순차적으로 제공될 예정이에요.
        </Banner>
      </Body>
    </div>
  );
}
