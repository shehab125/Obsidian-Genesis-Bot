import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSessionValue } from "@/lib/admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const session = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const expectedSession = await getAdminSessionValue();
  const authenticated = expectedSession && session === expectedSession;

  if (authenticated) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json({ ok: false, message: "Admin authentication required." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
