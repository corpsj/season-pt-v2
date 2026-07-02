"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** 백그라운드에 있던 PWA가 복귀하면 서버 데이터를 갱신한다(어제 홈·만료된 signed URL 방지). 60초 스로틀. */
export function RefreshOnFocus() {
  const router = useRouter();
  const last = useRef(Date.now());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last.current < 60_000) return;
      last.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
  return null;
}
