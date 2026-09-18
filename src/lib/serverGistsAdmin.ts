import { cookies } from "next/headers";
import { env } from "./env";
import { buildAdminGistQuery } from "./adminGistQuery";
import type { GistMedia, GistPoll } from "@/types";

export { buildAdminGistQuery };

/**
 * Types + server-side list-fetcher for /villagepeople/gists (the "browse
 * every gist regardless of status" screen) — same split as
 * serverModeration.ts/serverUsers.ts: GET /idiot/gists was still being
 * built in parallel when this was written (no route exists yet anywhere
 * under KamposBackend/src/modules/idiot/ as of this writing), so every
 * shape below is a best guess from the written contract, not confirmed
 * against a live response. Kept in this one file so reconciling field
 * names later (once the real backend lands) is a one-file fix, not a hunt
 * through the manager component and card.
 */

export type AdminGistStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

/**
 * One row from GET /idiot/gists. Assumed to carry the same poster-identity
 * fields as PendingGist (serverModeration.ts) — display_name/image_url,
 * "any profile type, not just students" per the written contract — plus
 * campus_tag/major_tag/level/color_key (present on the real consumer-facing
 * Gist type, src/types/index.ts) so ShortGist/CampusTag-style rendering
 * here looks the same as everywhere else. Engagement counts are assumed
 * FLAT on the row (reactions_count/comments_count/views_count/
 * shares_count/reports_count), matching the CONFIRMED shape of every real
 * /gists endpoint — see gistStore.ts's own normalizeGist comment, which
 * cites KamposBackend/src/modules/gist/gist.repo.ts directly — rather than
 * PendingGist's narrower "just reports_count" assumption, since this
 * endpoint is documented as pulling from the same gist rows.
 */
export interface AdminGist {
  gist_id: string;
  avitag: string;
  gist_text: string;
  gist_status: AdminGistStatus;
  created_at: string;
  display_name?: string | null;
  image_url?: string | null;
  /** The backend's own uppercase profile-type enum (STUDENT/KREATOR/...) —
   * `g.*` on the underlying gists row, same casing as everywhere else this
   * value comes straight off a JWT claim or the gists table itself. Run it
   * through normalizeProfileType() (types/index.ts) before using it as a
   * PROFILE_TYPE_PATH key, which is keyed lowercase. */
  profile_type?: string;
  media?: GistMedia[];
  campus_tag?: string | null;
  major_tag?: string | null;
  level?: string | null;
  color_key?: string | null;
  reactions_count?: number;
  comments_count?: number;
  views_count?: number;
  shares_count?: number;
  reports_count?: number;
  /** Per-type breakdown (e.g. { LIKE: 3, FIRE: 1 }) — confirmed against
   * KamposBackend's gists.repo.ts, same jsonb_object_agg pattern the
   * consumer feed's own findWithCounts/listByUser already use. */
  reactions_by_type?: Record<string, number>;
  /** Null for the vast majority of gists. No `my_vote_option_id` on this
   * shape (unlike the consumer-facing GistPoll) — the backend's admin-side
   * poll join deliberately never computes one, since an admin browsing this
   * screen isn't voting (see KamposBackend's ADMIN_POLL_JOIN_SQL). */
  poll?: Omit<GistPoll, "my_vote_option_id"> | null;
  /** Never redacted for this admin-facing shape (unlike the consumer app's
   * own Gist type) — avitag/display_name/image_url above are always the
   * real ones regardless of this flag. Only used to show a "posted
   * anonymously" badge so a reviewer knows this identity is hidden from
   * everyone else, not that it's hidden here too. */
  is_anonymous?: boolean;
  /** The quoted gist on a Yarn back — real, unredacted identity, same as
   * this row's own avitag/display_name/image_url above (no
   * redactIfAnonymous call anywhere on the admin side — a moderator needs
   * the real poster behind a quoted gist too, not just the top-level
   * one). `first_name`, not `display_name` — this nested shape mirrors
   * KamposBackend's consumer-facing QuotedGistPreviewRow verbatim
   * (gist.repo.ts's QUOTED_GIST_COLUMN, shared by every admin query too),
   * not this file's own top-level AdminGist naming. Absent entirely on a
   * plain (non-repost) gist; present-but-null (`quoted_gist_id` set,
   * `quoted_gist` itself null) means the original has since been
   * deleted — KamposBackend migration 0044 lets quoted_gist_id survive
   * that instead of losing the "this was a repost" signal. `poll` here
   * uses the same no-`my_vote_option_id` shape as this row's own top-level
   * `poll` above — AdminQuotedGistPreview renders it via AdminPollPreview. */
  quoted_gist_id?: string | null;
  quoted_gist?: {
    gist_id: string;
    avitag: string;
    gist_text: string;
    color_key?: string | null;
    is_anonymous?: boolean;
    campus_tag?: string | null;
    major_tag?: string | null;
    level?: string | null;
    first_name?: string | null;
    image_url?: string | null;
    media?: GistMedia[];
    poll?: Omit<GistPoll, "my_vote_option_id"> | null;
  } | null;
  [key: string]: unknown;
}

export interface AdminGistFilters {
  status?: AdminGistStatus | "";
  search?: string;
  campus_tag?: string;
  /** Scopes to one poster's own gists — used by the profile-view page's
   * gists section (AllGistsManager's own `avitag` prop). Confirmed against
   * KamposBackend's gists.repo.ts/gists.controller.ts (`g.avitag = $4`). */
  avitag?: string;
  /** The last-seen gist's own gist_id — NOT an offset number. Same scheme
   * the consumer app's own profile-page gist list already uses (see
   * gistStore.ts's byUser() and ProfileView.tsx's loadMoreGists). */
  cursor?: string;
  limit?: number;
}

/**
 * Server-side fetch for the All Gists screen's initial (unfiltered) load —
 * same "forward the incoming cookie, hit the backend directly, return []
 * on any failure" pattern as listPendingGists()/searchUsers(). Every filter
 * change or scroll continuation from here on goes through allGistsStore's
 * client-side fetchGists instead, same split as Groups B/C.
 */
export async function listGists(filters: AdminGistFilters = {}): Promise<AdminGist[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const query = buildAdminGistQuery(filters);
    const res = await fetch(`${env.API_BASE}/idiot/gists${query ? `?${query}` : ""}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: AdminGist[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}
