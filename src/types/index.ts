// Domain types for the Kampos API. Kept intentionally permissive where the
// backend shape isn't fully pinned down; tightened as endpoints are confirmed.

export type ProfileType = "student" | "kreator" | "kompany" | "school" | "idiot";

const PROFILE_TYPES: readonly ProfileType[] = ["student", "kreator", "kompany", "school", "idiot"];

/**
 * The backend's own ProfileType enum (KamposBackend/src/modules/profile/utils.ts)
 * is uppercase — "STUDENT", "KREATOR", etc — sent as-is in every response that
 * carries a profileType (/account/profile, /auth/switch-profile). This app's
 * type/comparisons assume lowercase everywhere, so every value has to pass
 * through here the moment it arrives from the API — normalizing at every
 * individual call site instead would be easy to miss and had already silently
 * broken the "is this a student profile" check in Profile Settings.
 */
export function normalizeProfileType(value: unknown): ProfileType | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return (PROFILE_TYPES as readonly string[]).includes(lower) ? (lower as ProfileType) : null;
}

export interface Account {
  account_id?: string;
  email: string;
  is_otp_verified?: boolean;
  created_at?: string;
  /** Account-level admin tier, distinct from ProfileType (which is
   * per-profile, e.g. an "idiot" PROFILE can exist for moderation reasons
   * unrelated to this). 'idiot' = admin, 'king' = admin + can manage other
   * admins. Absent/'user' = no admin access. See lib/roles.ts for the
   * shared "is this an admin" check both server and client code call into. */
  role?: "user" | "idiot" | "king";
  /** ACTIVE unless the account has been deactivated (self), suspended
   * (admin), or deleted (either) — see KamposBackend's account.repo.ts.
   * A non-ACTIVE account is rejected at login/refresh before a session is
   * ever resolved, so this field mainly matters for admin-facing UI
   * (Accounts search/detail) rather than gating anything client-side. */
  account_status?: "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "DELETED";
  /** Set on admin-triggered suspend (not self-deactivate/delete, which
   * don't carry one) — quoted back to the account owner. */
  account_status_reason?: string | null;
  [key: string]: unknown;
}

export interface StudentProfilePayload {
  first_name: string;
  last_name: string;
  campus_tag: string;
  major_tag: string;
  level: string;
  bio: string;
  avitag: string;
}

export interface Profile {
  avitag: string;
  profileType?: ProfileType;
  [key: string]: unknown;
}

/** Campus as consumed by the UI: a display label + the tag we submit. */
export interface CampusOption {
  label: string; // e.g. "University of Lagos (UNILAG)"
  tag: string; // e.g. "unilag"
}

export interface Major {
  major_name: string;
  major_tag: string;
}

export type ReactionEntity = "GIST" | "COMMENT";
export type ReactionType = "LIKE" | "LOVE" | "FIRE" | "SAD" | "LAUGH";

export interface GistMedia {
  media_id: string;
  gist_id: string;
  order_index: number;
  media_type: string;
  media_url: string;
  thumbnail_url?: string;
  /** Real dimensions from Cloudinary at upload time — absent/null on older
   * media (or anything attached by URL rather than uploaded, e.g. a GIF)
   * that predates this, or never had it. */
  width?: number | null;
  height?: number | null;
}

export interface GistCounts {
  reactions_count: number;
  comments_count: number;
  views_count: number;
  reports_count: number;
  shares_count?: number;
  /** Yarn back (quote-repost) count — absent/0 hides the count in the UI,
   * the icon alone is shown instead. */
  reposts_count?: number;
  /** Per-emoji reaction breakdown, mirrors the backend's reaction-count-by-type. */
  reactions_by_type?: Partial<Record<ReactionType, number>>;
}

export interface Gist {
  gist_id: string;
  name?: string; // Display name
  /** Poster's first name, joined from their profile — null when the
   * avitag isn't a student profile or has no name set. */
  first_name?: string | null;
  /** Poster's avatar image, joined from their profile. */
  image_url?: string | null;
  avitag: string;
  gist_text: string;
  created_at: string;
  edited_at?: string;
  media?: GistMedia[];
  counts?: GistCounts;
  campus_tag?: string;
  major_tag?: string;
  level?: string;
  /** The poster's own pick for the short-text hero color (one of
   * GIST_COLOR_KEYS in lib/brand.ts) — null/absent falls back to the
   * gist_id-hash-based color, same as before this existed. */
  color_key?: string | null;
  /** The viewer's own existing reaction on this gist, hydrated straight from
   * the list/get response — null when there's no viewer or they haven't
   * reacted yet, so the UI can show it as already-selected without a
   * separate per-gist fetch. */
  my_reaction?: ReactionType | null;
  /** Whether the viewer already reported this gist — persisted server-side,
   * survives reloads (unlike the old session-only "reported" UI state). */
  my_report?: boolean;
  /** Only present on gists from the ranked main-feed endpoint (listRecent)
   * — true once the viewer has already reacted to or commented on this
   * gist, i.e. it's past the "unseen" tier. Used to draw a one-time
   * "you're caught up" divider at the point the feed crosses from fresh
   * content into reruns. Absent (not false) on gists from any other
   * endpoint (a profile page, a shared link, etc.), which aren't ranked
   * this way at all. */
  _feed_seen?: boolean;
  /** Only present on gists from the ranked main-feed endpoint — an opaque
   * pagination token for this gist's position in the ranked order. Treat
   * it as a black box: read it off the last gist in a page and hand it
   * back verbatim as the next page's `cursor`, same as a plain gist_id
   * used to be handed back before the feed was ranked. */
  _feed_cursor?: string;
  /** Null for the vast majority of gists — only present when the poster
   * chose "poll" instead of media in the composer. Mutually exclusive with
   * `media`; a gist never has both (see CreateGistSheet's own poll mode). */
  poll?: GistPoll | null;
  /** Pseudonymous, not truly anonymous — create-only, locked at posting
   * time. When true and the viewer isn't the poster, the backend has
   * already redacted avitag/first_name/image_url/major_tag/level to
   * null/a placeholder before this ever reaches the client (see
   * gist.repo.ts's redactIfAnonymous) — the frontend never does its own
   * hiding of real data that already arrived in the response. */
  is_anonymous?: boolean;
  /** Which gist this one is Yarning back — absent entirely on a plain
   * (non-repost) gist, present forever once set (create-only, survives
   * the original being deleted — see KamposBackend migration 0044).
   * Check THIS, not `quoted_gist` below, to decide whether to render the
   * repost UI at all: `quoted_gist_id` set + `quoted_gist` null means the
   * original has been deleted (render a "no longer available" state —
   * RepostThreadLine's own null-quotedGist branch does this already),
   * NOT "not a repost." */
  quoted_gist_id?: string | null;
  /** The original gist's actual content, joined server-side — null when
   * quoted_gist_id points at a gist that's since been deleted (the join
   * just comes back empty), absent entirely on a plain (non-repost)
   * gist. Already redacted server-side if the quoted poster is anonymous
   * (gist.repo.ts's redactIfAnonymous recurses into this), same as
   * is_anonymous's own doc above — nothing extra to hide here. */
  quoted_gist?: Gist | null;
  [key: string]: unknown;
}

export interface GistPollOption {
  option_id: string;
  option_text: string;
  /** Live vote count — always present, even before the viewer has voted
   * (the UI just doesn't show it until they do, see PollBlock). */
  votes_count: number;
}

export interface GistPoll {
  poll_id: string;
  /** 2-4 entries, in the order the poster added them. */
  options: GistPollOption[];
  /** null for a guest, or a viewer who hasn't voted on this poll yet. */
  my_vote_option_id: string | null;
}

export interface Comment {
  comment_id: string;
  gist_id: string;
  avitag?: string;
  text: string;
  commented_at: string;
  /** Total reactions on this comment — comments get a lighter single
   * tap-to-like, not the full 5-emoji breakdown gists get. */
  reactions_count?: number;
  /** The viewer's own reaction on this comment, if any. */
  my_reaction?: ReactionType | null;
  /** Commenter's profile info — null when the avitag isn't a student
   * profile (only students have campus/major) or has none set. Raw tags
   * (e.g. "unilag"), matching how gists show campus_tag/major_tag too. */
  first_name?: string | null;
  last_name?: string | null;
  campus_tag?: string | null;
  major_tag?: string | null;
  level?: number | null;
  /** Commenter's avatar image, joined from their profile. */
  image_url?: string | null;
  [key: string]: unknown;
}

export interface Reaction {
  reaction_id: string;
  avitag: string;
  entity_type: ReactionEntity;
  entity_id: string;
  type: ReactionType;
  created_at: string;
}
