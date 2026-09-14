import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { copyCookies, createClient as createSupabaseProxyClient } from "@/utils/supabase/middleware";

const PUBLIC_PATHS = new Set(["/login"]);

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

function isFinanceAnalyticsPath(pathname: string) {
  return pathname === "/finance" || pathname === "/finance/";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabase, response } = createSupabaseProxyClient(request);
  if (supabase) {
    await supabase.auth.getUser();
  }

  const redirect = (url: URL) => copyCookies(response, NextResponse.redirect(url));
  const isPublic = PUBLIC_PATHS.has(pathname);
  const token = request.cookies.get("nccs_session")?.value;

  if (!token && !isPublic) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return redirect(login);
  }

  if (token && isPublic) {
    return redirect(new URL("/", request.url));
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
        return redirect(new URL("/", request.url));
      }
      if (role === "ACCOUNTANT" && isFinanceAnalyticsPath(pathname)) {
        return redirect(new URL("/finance/income", request.url));
      }
    } catch {
      const next = redirect(new URL("/login", request.url));
      next.cookies.delete("nccs_session");
      return next;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
