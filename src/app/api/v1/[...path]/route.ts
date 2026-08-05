import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Same-origin proxy in front of the real backend.
 *
 * Why this exists: the backend sets the session as an httpOnly cookie. As
 * long as the browser talks to the backend's own domain directly, that's
 * fine — the browser correctly attaches the cookie to requests aimed at
 * whoever set it. But this app's own server (Next.js, running Server
 * Components) also needs to check "who is this?" before rendering a page —
 * and it can only ever see cookies that belong to *this* app's domain.
 * A cookie stamped by a completely different origin (the backend) never
 * reaches this app's server at all, no matter what.
 *
 * The fix: stop letting the browser talk to the backend directly. Instead,
 * every request goes to this app's own `/api/v1/...` (this route), which
 * forwards it to the real backend and relays the response — including
 * `Set-Cookie` — back untouched. Because the browser only ever sees a
 * response coming from *this app's* origin, it stores that cookie as
 * belonging to this app. From then on, both the browser's own requests
 * and this app's server (reading the same cookie via `next/headers`)
 * see the exact same, genuinely first-party session.
 */
export const dynamic = "force-dynamic";

const HOP_BY_HOP_REQUEST_HEADERS = ["host", "content-length", "connection"];
const HOP_BY_HOP_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"];

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${env.API_URL}/api/v1/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP_REQUEST_HEADERS) headers.delete(h);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // Required by Node's fetch whenever the request body is a stream.
    init.duplex = "half";
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { success: false, message: "Abeg check your internet connection" },
      { status: 502 },
    );
  }

  const resHeaders = new Headers(backendRes.headers);
  for (const h of HOP_BY_HOP_RESPONSE_HEADERS) resHeaders.delete(h);

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    headers: resHeaders,
  });
}

async function handler(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
