import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { MEMBER_COOKIE, verifySession } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
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
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/t/:path*", "/m/:path*", "/console/:path*"],
};
