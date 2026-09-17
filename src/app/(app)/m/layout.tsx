import { redirect } from "next/navigation";
import { getMemberContext } from "@/lib/auth/context";

/** Database-backed guard for every member route, including stale but valid signed cookies. */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const member = await getMemberContext();
  if (!member) redirect("/login/member");
  return children;
}
