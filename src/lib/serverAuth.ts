import { cache } from "react";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { destinationFor } from "./authGate";
import { isAdminRole } from "./roles";
import type { AuthGateState } from "@/stores/authStore";
import type { AccountProfileResponse, ProfileSummary } from "@/stores/authStore";
import type { Account } from "@/types";

type ResolvedAuthState = { state: AuthGateState; account: Account | null; profiles: ProfileSummary[] };

/**
 * Server-side counterpart to authStore's resolveAuthState — same "who is
 * this, really" question, same backend call, but run on the server during
 * render instead of from the browser after the page has already painted a
 * spinner. The session cookie is httpOnly (this app's JS can't read it),
 * but Next's server can: it arrives on the incoming request, and we just
 * forward it verbatim to the backend (a server-to-server fetch isn't
 * subject to CORS, so this needs no special handling beyond the header).
 *
 * Never throws — an unreachable backend or a missing/dead session both
 * resolve cleanly (to "unknown" and "guest" respectively, see below).
 *
 * Wrapped in React's cache() — same reasoning as serverProfile.ts's
 * fetchStudentProfileByAvitag: villagepeople's layout.tsx (the admin gate)
 * and its admins/page.tsx (the stricter king-only re-check) both need this
 * same per-request result, and without this they'd each trigger their own
 * real round-trip to the backend for identical data.
 */
export const resolveServerAuthState = cache(async function resolveServerAuthState(): Promise<{
  state: AuthGateState;
  account: Account | null;
  profiles: ProfileSummary[];
}> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/account/profile`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      // Auth state is per-request, per-visitor — never cache across requests.
      cache: "no-store",
    });
    if (!res.ok) {
      // 401/403 = the backend explicitly says "not authenticated" — the
      // session is genuinely gone and the user really does need to log in.
      if (res.status === 401 || res.status === 403) {
        return { state: "guest", account: null, profiles: [] };
      }
      // 5xx (or any other non-auth error) = backend temporarily unavailable
      // (e.g. Render free-tier cold-starting). The middleware already tried
      // to refresh; returning "guest" here would log the user out for what
      // is actually just a momentary server blip. Return "unknown" instead
      // so gateServer lets the request through and the client can re-verify
      // once the backend finishes waking up.
      return { state: "unknown", account: null, profiles: [] };
    }
    const json = (await res.json()) as { data?: AccountProfileResponse };
    const account = json.data?.account ?? null;
    const profiles = json.data?.profiles ?? [];
    let state: AuthGateState;
    if (!account) state = "guest";
    else if (!account.is_otp_verified) state = "needs-otp";
    else if (profiles.length === 0) state = "needs-profile";
    else state = "active";
    return { state, account, profiles };
  } catch {
    // Network error / timeout — the backend is unreachable, same treatment
    // as 5xx above. Don't log the user out for a transient connectivity blip.
    return { state: "unknown", account: null, profiles: [] };
  }
});

/**
 * Call at the top of a page's server component. Resolves the real auth
 * state and, if this page isn't in `allow`, redirects before any HTML for
 * this page is ever sent — no client-side flash, no spinner, no round trip
 * after the fact. Returns the resolved data so the page can hand it to
 * <HydrateAuth> and skip a second, redundant client-side fetch.
 *
 * "unknown" (backend temporarily unreachable) is intentionally not
 * redirected — the page renders without server-verified account data and
 * HydrateAuth re-resolves client-side once the backend recovers. This
 * prevents Render cold-start blips from logging users out.
 */
export async function gateServer(allow: AuthGateState[]) {
  const result = await resolveServerAuthState();
  // Backend was unreachable during this render — don't redirect. The page
  // renders without confirmed account data; HydrateAuth will re-verify
  // client-side once the backend finishes waking up.
  if (result.state === "unknown") return result;
  if (!allow.includes(result.state)) {
    redirect(destinationFor(result.state));
  }
  return result;
}

const TAB_AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level, in-memory, per-process — correct for this app's
// single-instance deployment (a multi-instance/edge deployment would need
// a shared store instead). Keyed by a hash of the FULL cookie header
// (access + refresh token both), not just the session id, so a token
// refresh — middleware.ts silently rotates the access token roughly every
// 15 minutes — naturally produces a fresh cache entry too, layered on top
// of the explicit TTL below. Hashed rather than keyed by the raw cookie
// string purely so a session token never ends up sitting in a Map key
// that could get logged/inspected during debugging.
const tabAuthCache = new Map<string, { result: ResolvedAuthState; expiresAt: number }>();

// Opportunistic, not a timer — runs only when the cache has grown past a
// small threshold, so a long-running process doesn't accumulate entries
// for sessions that leave and never come back, without needing a
// setInterval (and its own cleanup) just to bound memory.
function sweepExpiredTabAuthCache() {
  const now = Date.now();
  for (const [key, entry] of tabAuthCache) {
    if (entry.expiresAt <= now) tabAuthCache.delete(key);
  }
}

async function resolveServerAuthStateCached(): Promise<ResolvedAuthState> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const key = createHash("sha256").update(cookieHeader).digest("hex");

  const cached = tabAuthCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const result = await resolveServerAuthState();
  // "unknown" (backend unreachable) is deliberately never cached — caching
  // a transient failure would mean a cold-starting backend that recovers
  // 10 seconds later still reads as unreachable for the rest of the
  // window on these routes, defeating the whole point of "unknown" being
  // a soft, retry-next-time fallback in the first place.
  if (result.state !== "unknown") {
    if (tabAuthCache.size > 500) sweepExpiredTabAuthCache();
    tabAuthCache.set(key, { result, expiresAt: Date.now() + TAB_AUTH_CACHE_TTL_MS });
  }
  return result;
}

/**
 * Same question gateServer() answers, same redirect behavior — but
 * tolerates an answer up to 5 minutes stale, cached per session. Scoped
 * deliberately to just the three bottom-tab routes (/feed, /video, and a
 * profile page use this or resolveServerAuthStateForTabs below); every
 * other gated route keeps calling gateServer() itself, always fresh. This
 * is not a blanket change to how auth is checked — see the full writeup
 * this came out of for the reasoning, short version:
 *
 * Switching tabs used to re-verify "is this session still allowed" fully,
 * fresh, from the backend, on literally every single tap — the direct
 * cause of navigation feeling slow whenever the backend is cold (see
 * middleware.ts's own doc on Render free-tier cold starts). Caching this
 * check specifically is safe because it only ever gates whether a PAGE
 * renders — every actual mutating action (react, comment, post, delete)
 * still hits the real backend fresh on every call, completely
 * independent of this cache. So the real exposure of a stale "active"
 * result is "can keep viewing for a few minutes," never "can keep
 * acting."
 *
 * The risky direction — a user whose status just became MORE permissive
 * (finished OTP verification or profile setup) getting stuck behind a
 * stale LESS-permissive cached result — structurally can't happen here:
 * those transitions happen on /verify-otp and /setup-profile, which are
 * outside this cache's scope entirely, and a not-yet-active user would
 * have been redirected away from these three routes (by this same
 * function) before ever successfully rendering — and therefore caching —
 * anything on them in the first place.
 */
export async function gateServerForTabs(allow: AuthGateState[]) {
  const result = await resolveServerAuthStateCached();
  if (result.state === "unknown") return result;
  if (!allow.includes(result.state)) {
    redirect(destinationFor(result.state));
  }
  return result;
}

/**
 * Same cache as gateServerForTabs, no redirect — for the profile page,
 * which never gates on auth state at all (a profile is public; this is
 * only ever used to know whether the viewer is looking at their own page).
 */
export async function resolveServerAuthStateForTabs(): Promise<ResolvedAuthState> {
  return resolveServerAuthStateCached();
}

/**
 * "Is the account resolveServerAuthState() already resolved an admin" —
 * takes the account straight from that call's own result rather than
 * re-fetching, so a layout (or a page re-checking a stricter tier, e.g.
 * villagepeople/admins wanting specifically 'king') can ask this without
 * another network round-trip. See lib/roles.ts for the shared role check
 * this and authStore's client-side mirror both call into.
 */
export function isAdminAccount(account: Account | null): boolean {
  return isAdminRole(account?.role);
}
