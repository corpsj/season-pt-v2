import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { MEMBER_COOKIE, signSession, verifySession } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Trainer area → Supabase Auth session required.
  if (pathname.startsWith("/t")) {
    const { response, user } = await updateSession(request);
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login/trainer";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Desktop owner console → keep the Supabase session fresh, but DON'T force-redirect:
  // the console layout renders its own login screen when there's no owner session, so
  // /console stays the single PC entry point. Owner-only gating lives in the layout.
  if (pathname.startsWith("/console")) {
    const { response } = await updateSession(request);
    return response;
  }

  // Member area → custom signed cookie required.
  if (pathname.startsWith("/m")) {
    const session = await verifySession(request.cookies.get(MEMBER_COOKIE)?.value);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/login/member";
      return NextResponse.redirect(url);
    }
    // 슬라이딩 연장: 만료 7일 이내면 재서명 — 30일 하드만료로 열린 앱이 조용히 먹통되는 것 방지(감사3 #20)
    if (session.exp && session.exp - Date.now() < 7 * 86400000) {
      const token = await signSession({ memberId: session.memberId, name: session.name });
      const res = NextResponse.next();
      res.cookies.set(MEMBER_COOKIE, token, {
        httpOnly: true, sameSite: "lax",
        secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/t/:path*", "/m/:path*", "/console/:path*"],
};
