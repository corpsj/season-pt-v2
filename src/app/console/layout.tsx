import { requireOwnerPage } from "@/lib/auth/guard";
import { sb } from "@/lib/data/db";
import { getChatUnread } from "@/lib/data/groups/chat";
import { getRetention } from "@/lib/data/groups/perf-retention";
import { ConsoleProviders } from "@/components/console/ConsoleProviders";
import { Sidebar } from "@/components/console/Sidebar";

/**
 * 대표 운영 콘솔 (PC) — desktop shell. Lives OUTSIDE the (app) group so it is
 * not wrapped in the mobile phone Frame. Owner-only (requireOwnerPage redirects
 * instructors to /t). Reuses the same Supabase data layer as the mobile app.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const t = await requireOwnerPage();
  const [chatUnread, retention, pendingRes] = await Promise.all([
    getChatUnread(),
    getRetention(),
    sb
      .from("schedule_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("requester_type", "member"),
  ]);

  return (
    <ConsoleProviders>
      <div className="relative flex h-screen w-full overflow-hidden bg-frame text-ink">
        <Sidebar
          ownerName={t.displayName}
          badges={{
            members: retention.expiringCount,
            requests: pendingRes.count ?? 0,
            messages: chatUnread,
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col bg-[#F1ECE2]">{children}</main>
      </div>
    </ConsoleProviders>
  );
}
