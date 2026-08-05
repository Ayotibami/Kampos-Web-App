import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { destinationFor } from "./authGate";
import type { AuthGateState } from "@/stores/authStore";
import type { AccountProfileResponse, ProfileSummary } from "@/stores/authStore";
import type { Account } from "@/types";

/**
 * Server-side counterpart to authStore's resolveAuthState — same "who is
 * this, really" question, same backend call, but run on the server during
 * render instead of from the browser after the page has already painted a
 * spinner. The session cookie is httpOnly (this app's JS can't read it),
 * but Next's server can: it arrives on the incoming request, and we just
 * forward it verbatim to the backend (a server-to-server fetch isn't
 * subject to CORS, so this needs no special handling beyond the header).
 *
 * Never throws — an unreachable backend or a missing session both resolve
 * to "guest", matching resolveAuthState's own behavior.
 */
export async function resolveServerAuthState(): Promise<{
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
      return { state: "guest", account: null, profiles: [] };
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
    return { state: "guest", account: null, profiles: [] };
  }
}

/**
 * Call at the top of a page's server component. Resolves the real auth
 * state and, if this page isn't in `allow`, redirects before any HTML for
 * this page is ever sent — no client-side flash, no spinner, no round trip
 * after the fact. Returns the resolved data so the page can hand it to
 * <HydrateAuth> and skip a second, redundant client-side fetch.
 */
export async function gateServer(allow: AuthGateState[]) {
  const result = await resolveServerAuthState();
  if (!allow.includes(result.state)) {
    redirect(destinationFor(result.state));
  }
  return result;
}
