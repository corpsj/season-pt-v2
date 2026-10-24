"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Tab-scoped recovery is removed on logout/login and when entering a member area. */
export function ClassDraftRecoveryBoundary() {
  const path = usePathname();
  useEffect(() => {
    if (
      path.startsWith("/t") ||
      path.startsWith("/console") ||
      (process.env.NODE_ENV === "development" && path === "/dev/class-workflow")
    )
      return;
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("spt-class-draft:")) sessionStorage.removeItem(key);
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }, [path]);
  return null;
}
