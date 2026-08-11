// Domain types for the Kampos API. Kept intentionally permissive where the
// backend shape isn't fully pinned down; tightened as endpoints are confirmed.

export type ProfileType = "student" | "kreator" | "kompany" | "school" | "idiot";

export interface Account {
  account_id?: string;
  email: string;
  is_otp_verified?: boolean;
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
}

export interface GistCounts {
  reactions_count: number;
  comments_count: number;
  views_count: number;
  reports_count: number;
  shares_count?: number;
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
  [key: string]: unknown;
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
