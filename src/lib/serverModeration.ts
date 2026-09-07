import { cookies } from "next/headers";
import { env } from "./env";
import type { GistMedia, ProfileType } from "@/types";

/**
 * Types + server-side list-fetchers for the /villagepeople/moderation
 * screens (Group B), same split as serverAdmins.ts (Group A): the exact
 * shape KamposBackend's /idiot/moderation endpoints return is being built in
 * parallel and wasn't confirmed against a running backend when this was
 * written, so every interface below is "best guess from the written
 * contract" — kept in this one file so reconciling field names later (once
 * the real backend lands) is a one-file fix, not a hunt through three tab
 * components. `[key: string]: unknown` on each is deliberate slack for
 * whatever else the real payload carries that these screens don't use yet.
 */

/** A pending (SUBMITTED) gist row from GET /idiot/moderation/gists. */
export interface PendingGist {
  gist_id: string;
  avitag: string;
  gist_text: string;
  gist_status: string;
  created_at: string;
  /** Poster's display name, joined server-side — assumed same "joined from
   * profile, absent if not a nameable profile type" shape as Gist.first_name
   * in types/index.ts, just under a different key per the written contract. */
  display_name?: string | null;
  image_url?: string | null;
  /** Uppercase, same as AdminGist's own field (serverGistsAdmin.ts) — run
   * through normalizeProfileType() before using as a PROFILE_TYPE_PATH key. */
  profile_type?: string;
  media?: GistMedia[];
  reports_count?: number;
  [key: string]: unknown;
}

/** A pending (unverified) profile row from GET /idiot/moderation/profiles —
 * spans all 5 ProfileType values, not just students. */
export interface PendingProfile {
  avitag: string;
  account_id: string;
  is_verified: boolean;
  profile_type: ProfileType;
  display_name?: string | null;
  image_url?: string | null;
  [key: string]: unknown;
}

/**
 * A pending report row from GET /idiot/moderation/reports. The reported
 * gist's own content is inlined FLAT onto this same row (gist_avitag,
 * gist_text, gist_status, display_name, image_url, media) — NOT nested
 * under a `gist` sub-object — confirmed directly against
 * KamposBackend's report.repo.ts `listPendingWithDetails()` SQL, which
 * does `SELECT r.*, g.avitag AS gist_avitag, g.gist_text, g.gist_status,
 * ...` with no nesting.
 */
export interface PendingReport {
  report_id: string;
  gist_id: string;
  reporter_avitag: string;
  reason?: string | null;
  status: string;
  created_at: string;
  gist_avitag: string;
  gist_text: string;
  gist_status: string;
  display_name?: string | null;
  image_url?: string | null;
  media?: GistMedia[];
  [key: string]: unknown;
}

/**
 * Shared "forward the incoming cookie, hit the backend directly, return []
 * on any failure" fetch — same pattern as serverAdmins.ts's listAdmins(),
 * factored out once here since all three moderation lists need it
 * identically. Returning [] rather than throwing means the page renders an
 * empty state instead of crashing if this route isn't deployed/migrated yet
 * wherever this runs against (per this task's own backend-may-not-exist-yet
 * caveat).
 */
async function fetchModerationList<T>(path: string, limit?: number): Promise<T[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const query = limit ? `?limit=${limit}` : "";
    const res = await fetch(`${env.API_BASE}/idiot/moderation/${path}${query}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: T[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

// Gists queue gets a wider first batch than reports/profiles — posts come
// in fast enough that the backend's own default limit (20) would leave an
// admin only ever seeing a sliver of what's actually pending. Must match
// PendingPostsTab.tsx's own INITIAL_LIMIT constant, which is what its
// "load more"/hasMore logic compares this initial fetch size against.
const INITIAL_GIST_LIMIT = 100;

export async function listPendingGists(): Promise<PendingGist[]> {
  return fetchModerationList<PendingGist>("gists", INITIAL_GIST_LIMIT);
}

export async function listPendingProfiles(): Promise<PendingProfile[]> {
  return fetchModerationList<PendingProfile>("profiles");
}

export async function listPendingReports(): Promise<PendingReport[]> {
  return fetchModerationList<PendingReport>("reports");
}
