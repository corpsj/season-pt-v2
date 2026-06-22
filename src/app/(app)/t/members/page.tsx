"use client";
import { useState } from "react";
import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Chip } from "@/components/ui/Chip";
import { Badge } from "@/components/ui/Badge";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { StatTriple } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { getMe, getMembers, getChatUnread } from "@/lib/data";
import { trainerTabs } from "@/components/trainer/tabs";
import type { MemberFilter } from "@/lib/types";

const FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "expiring", label: "만료임박" },
  { value: "active", label: "활성" },
  { value: "rest", label: "휴회" },
];

export default function MembersPage() {
  const me = getMe();
  const [filter, setFilter] = useState<MemberFilter>("all");
  const view = getMembers(filter);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <h1 className="mb-3.5 text-[21px] font-bold text-ink">회원 관리</h1>

        <div className="mb-3.5">
          <StatTriple
            items={[
              { value: view.totals.total, label: "담당 회원" },
              { value: view.totals.expiring, label: "만료 임박", color: "text-terracotta" },
              { value: view.totals.rest, label: "휴회" },
            ]}
          />
        </div>

        {/* search bar (display only) */}
        <div className="mb-3 flex items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-3.5 py-3">
          <Icon name="search" size={18} className="flex-none text-muted4" />
          <span className="text-[13px] text-placeholder">이름 · 연락처 검색</span>
        </div>

        {/* filter chips */}
        <div className="mb-3.5 flex gap-2">
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              selected={filter === f.value}
              tone={f.value === "expiring" ? "expiring" : "default"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </div>

        {/* member list */}
        {view.items.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {view.items.map((m) => (
              <Link
                key={m.id}
                href={`/t/members/${m.id}`}
                className="tappable flex items-center gap-3 rounded-[14px] border border-ink/[0.055] bg-card px-3.5 py-3"
              >
                {m.isTeam && m.team ? (
                  <TeamAvatar team={m.team} size={42} />
                ) : (
                  <Avatar initial={m.initial} tone={m.avatarTone} size={42} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink">{m.name}</div>
                  <div className="mt-0.5 truncate text-[11.5px] text-muted">{m.sub}</div>
                </div>
                <Badge variant={m.badge.variant}>{m.badge.text}</Badge>
                <Icon name="chevron-right" size={16} className="flex-none text-chevron" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="persons"
            title="해당하는 회원이 없어요"
            desc="다른 필터를 선택해 보세요."
          />
        )}
        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner: me.isOwner, chatUnread: getChatUnread() })} />
    </div>
  );
}
