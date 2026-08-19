import { cookies } from "next/headers";
import { env } from "./env";
import type { Gist, GistCounts } from "@/types";

export interface GistContext {
  target: Gist;
  before: Gist[];
  after: Gist[];
}

/**
 * Same normalization the client-side gistStore does — the backend returns
 * reactions_count/comments_count/views_count etc. as flat fields on each
 * gist row, but the frontend reads them nested under `gist.counts`.
 * Without this, every count silently reads as undefined → renders as 0.
 * Duplicated here (not imported from gistStore) so server components don't
 * pull in the entire Zustand store just for one pure function.
 */
function normalizeGist(raw: Gist): Gist {
  const counts: GistCounts = {
    reactions_count: Number(
      raw.reactions_count ?? raw.counts?.reactions_count ?? 0,
    ),
    comments_count: Number(
      raw.comments_count ?? raw.counts?.comments_count ?? 0,
    ),
    views_count: Number(raw.views_count ?? raw.counts?.views_count ?? 0),
    reports_count: Number(raw.reports_count ?? raw.counts?.reports_count ?? 0),
    shares_count: Number(raw.shares_count ?? raw.counts?.shares_count ?? 0),
    reactions_by_type:
      (raw.reactions_by_type as GistCounts["reactions_by_type"]) ??
      raw.counts?.reactions_by_type,
  };
  return { ...raw, counts };
}

function normalizeGists(raw: Gist[]): Gist[] {
  return raw.map(normalizeGist);
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

/**
 * Server-side fetch for the feed's first page — same pattern as
 * fetchGistContext (forward the incoming cookie, hit the backend directly,
 * never cache). Returns an empty array on any failure so the client
 * component can gracefully fall back to its own client-side fetch.
 *
 * The backend defaults to 20 gists per page (see gist.controller.ts's list
 * handler), matching what the client-side gistStore.list() already requests.
 */
export async function fetchFeedGists(): Promise<Gist[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/gists?limit=30`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Gist[] };
    return normalizeGists(json.data ?? []);
  } catch {
    return [];
  }
}

/**
 * Server-side fetch for a profile page's first page of gists — same pattern
 * as fetchFeedGists but scoped to a specific user's avitag. Returns an empty
 * array on any failure so the client component can fall back gracefully.
 */
export async function fetchUserGists(avitag: string): Promise<Gist[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(
      `${env.API_BASE}/gists/user/${encodeURIComponent(avitag)}?limit=30`,
      {
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Gist[] };
    return normalizeGists(json.data ?? []);
  } catch {
    return [];
  }
}
