import { cookies } from "next/headers";
import { env } from "./env";
import type { Gist } from "@/types";

export interface GistContext {
  target: Gist;
  before: Gist[];
  after: Gist[];
}

/**
 * Server-side fetch for the shared-link view — same "forward the incoming
 * cookie, hit the backend directly, never cache across requests" pattern
 * resolveServerAuthState uses, but for gist data instead of account state.
 * Works identically for a guest (no cookie forwarded, backend's fakeAuth
 * middleware just treats the request as anonymous) and a real session.
 *
 * Returns null for a gist that genuinely doesn't exist (bad/stale id) —
 * the caller renders notFound() for that. A REJECTED gist still comes back
 * normally here; it's the caller's job to render the "removed" state for
 * that specific status, not this fetch's.
 */
export async function fetchGistContext(
  gistId: string,
  before = 15,
  after = 15,
): Promise<GistContext | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(
      `${env.API_BASE}/gists/${encodeURIComponent(gistId)}/context?before=${before}&after=${after}`,
      {
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: GistContext };
    return json.data ?? null;
  } catch {
    return null;
  }
}
