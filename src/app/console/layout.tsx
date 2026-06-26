import { cookies } from "next/headers";
import { getTrainerContext } from "@/lib/data/db";
import { sb } from "@/lib/data/db";
import { getChatUnread } from "@/lib/data/groups/chat";
import { getRetention } from "@/lib/data/groups/perf-retention";
import { ConsoleProviders } from "@/components/console/ConsoleProviders";
import { Sidebar } from "@/components/console/Sidebar";
import { ConsoleLogin } from "./ConsoleLogin";

/**
 * 대표 운영 콘솔 (PC) — desktop shell. Lives OUTSIDE the (app) group so it is not
 * wrapped in the mobile phone Frame. Single PC entry point: when there is no owner
 * session it renders a simple login (아이디·비밀번호·로그인), otherwise the dashboard.
 * Reuses the same Supabase data layer as the mobile app.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const t = await getTrainerContext();

  // Not signed in (or signed in as a non-owner) → show the login screen instead of the
  // dashboard. Children (the section pages) are not rendered, so their getters never run.
  if (!t || t.role !== "owner") {
    return <ConsoleLogin notOwner={!!t} />;
  }

  const [chatUnread, retention, pendingRes, ck] = await Promise.all([
    getChatUnread(),
    getRetention(),
    sb
      .from("schedule_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("requester_type", "member"),
    cookies(),
  ]);
  const privacyHidden = ck.get("spt_console_priv")?.value === "1";

  return (
    <ConsoleProviders initialHidden={privacyHidden}>
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
