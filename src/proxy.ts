import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/robots.txt", "/sitemap.xml"]);
/** The public college website; everything else needs a staff session. */
const WEBSITE_PATHS = ["/", "/about", "/facilities", "/faculty", "/admissions", "/news", "/contact"];

function isWebsitePath(pathname: string) {
  // The share image is served as /opengraph-image-<hash>.
  if (pathname.startsWith("/opengraph-image")) return true;
  return WEBSITE_PATHS.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));
}

/** Where to go after sign-in: a path on this site, or the dashboard. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/dashboard";
}

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

function isFinanceAnalyticsPath(pathname: string) {
  return pathname === "/finance" || pathname === "/finance/";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isWebsitePath(pathname)) return NextResponse.next();
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/auth/");
  const token = request.cookies.get("nccs_session")?.value;

  if (!token && !isPublic) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      const role = String(payload.role);
      if (
        (pathname.startsWith("/users") ||
          pathname.startsWith("/settings") ||
          pathname.startsWith("/audit") ||
          pathname.startsWith("/api/backup")) &&
        role !== "ADMIN"
      ) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      if (role === "ACCOUNTANT" && isFinanceAnalyticsPath(pathname)) {
        return NextResponse.redirect(new URL("/finance/income", request.url));
      }
    } catch {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("nccs_session");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
