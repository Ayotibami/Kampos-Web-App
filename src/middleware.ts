import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const ACCESS_COOKIE = "kampos_at";
const REFRESH_COOKIE = "kampos_rt";

/** Decodes a JWT's payload without verifying its signature — fine here,
 * this is only used to decide "is it worth attempting a refresh before the
 * page's own gate check runs," not as an actual auth decision. The real
 * verification still happens on every backend request regardless. */
function isExpiredOrExpiringSoon(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    if (typeof payload.exp !== "number") return false;
    // A few seconds of slack — refreshing right at the edge risks the token
    // dying in the gap between this check and the page's own fetch a
    // moment later, which is exactly the bug this middleware exists to fix.
    return Date.now() / 1000 > payload.exp - 15;
  } catch {
    return true;
  }
}

/**
 * The access token is short-lived (15 min) on purpose — but Server
 * Components can't write cookies (only Route Handlers/Server Actions/
 * middleware can), so resolveServerAuthState's plain fetch to
 * /account/profile had no way to recover from a dead access token even
 * when a perfectly valid refresh token was sitting right there in the same
 * request. That's why reopening the app after sitting idle for >15 minutes
 * bounced straight to /login instead of just quietly staying logged in,
 * the same way the browser's own axios interceptor already handles it on
 * the client side. This is that same silent refresh, run one layer
 * earlier — before any page's own server-side gate check ever sees the
 * request — with the one thing only middleware can actually do:
 * forwarding the backend's new Set-Cookie headers onto the real response.
 */
export async function middleware(request: NextRequest) {
  const at = request.cookies.get(ACCESS_COOKIE)?.value;
  const rt = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!rt || (at && !isExpiredOrExpiringSoon(at))) {
    return NextResponse.next();
  }

  try {
    const refreshRes = await fetch(`${env.API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: request.headers.get("cookie") ?? "" },
    });

    if (!refreshRes.ok) return NextResponse.next();

    // Rewrite the incoming request's own cookies too, not just the outgoing
    // response's — otherwise this same request continues on to the page's
    // gate check still carrying the old (expired) access token, defeating
    // the entire point of refreshing before that check runs.
    const forwardedRequestHeaders = new Headers(request.headers);
    // Merge: start from the existing cookies, then overwrite only the ones
    // the refresh response actually set. A plain .set() replacement would
    // drop any cookie not returned by the refresh endpoint — e.g. the
    // still-valid refresh token itself if the backend only sends a new
    // access token — which would make this same request's gate check see
    // no refresh token and treat the session as a guest.
    const cookieMap = new Map<string, string>();
    for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
      const eq = pair.trim().indexOf("=");
      if (eq > 0) cookieMap.set(pair.trim().slice(0, eq), pair.trim().slice(eq + 1));
    }
    for (const setCookie of refreshRes.headers.getSetCookie()) {
      const pair = setCookie.split(";")[0].trim();
      const eq = pair.indexOf("=");
      if (eq > 0) cookieMap.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    const mergedCookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
    if (mergedCookies) forwardedRequestHeaders.set("cookie", mergedCookies);

    const response = NextResponse.next({ request: { headers: forwardedRequestHeaders } });
    for (const cookie of refreshRes.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch {
    // Backend unreachable — let the request through as-is; the page's own
    // gate check falls back to "guest", same as it always has.
    return NextResponse.next();
  }
}

export const config = {
  // Everything except static assets, the proxy's own API routes (they
  // already carry cookies straight through untouched), and Next internals.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};
