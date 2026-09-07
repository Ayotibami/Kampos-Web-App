import { cookies } from "next/headers";
import { env } from "./env";
import { buildUserSearchQuery } from "./userSearchQuery";
import type { ProfileType } from "@/types";

export { buildUserSearchQuery };

/**
 * Types + server-side fetchers for the /villagepeople/users screens (Group
 * C — people management). Same split as serverAdmins.ts (Group A) and
 * serverModeration.ts (Group B): KamposBackend's /idiot/users endpoints
 * were still being built in parallel when this was written and hadn't
 * confirmed against a running backend, so every shape below is "best guess
 * from the written contract" — kept in this one file so reconciling field
 * names later is a one-file fix, not a hunt through several components.
 * `[key: string]: unknown` on each is deliberate slack for whatever else
 * the real payload carries that these screens don't use yet.
 */

/**
 * One row from GET /idiot/users — one row PER ACCOUNT (not per profile).
 * Originally one row per matching profile (an account with two profiles
 * showed up twice with no visible link between them) — changed to
 * account-centric after reviewing the list live: search/filter still work
 * against profile fields (avitag/campus/major/profile_type) under the hood,
 * but what actually renders is just the account, plus a `profile_count`
 * hint. Full profile detail (level/campus/major/bio/...) lives on the
 * account detail page instead of being repeated on every list row — see
 * AccountProfileRow below.
 */
export interface AccountSearchRow {
  account_id: string;
  email: string;
  account_status?: "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "DELETED";
  role?: "user" | "idiot" | "king";
  created_at?: string;
  last_login?: string | null;
  is_otp_verified?: boolean;
  profile_count?: number;
  [key: string]: unknown;
}

/**
 * Account-level filters only — campus/major/profile_type were removed once
 * live use showed they made no sense on a screen that no longer displays
 * any per-profile detail per row (that's the Profiles section's job now,
 * one tab per type, where those filters actually match what's shown).
 */
export interface UserSearchFilters {
  search?: string;
  role?: "user" | "idiot" | "king" | "";
  account_status?: "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "DELETED" | "";
  /** "only accounts with zero profiles" toggle — omitted/false applies no
   * restriction, there's no reason to ever filter FOR having a profile. */
  no_profile?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * One profile row under an account, from GET /idiot/users/:account_id's
 * `profiles` array — the FULL field set across all 5 profile types
 * (confirmed against KamposBackend's profile/utils.ts listByAccountFull,
 * tested directly against the live database before shipping). Most fields
 * are null for any given row depending on `profile_type` — a KOMPANY row
 * has `website`/`phone_number`/`social_links`, a STUDENT row has
 * `level`/`campus_tag`/`major_tag`/`bio`/`hobbies`, etc. The account detail
 * page picks which ones to actually render per type.
 */
export interface AccountProfileRow {
  avitag: string;
  account_id: string;
  profile_type: ProfileType;
  display_name?: string | null;
  image_url?: string | null;
  is_verified?: boolean;
  profile_status?: string;
  created_at?: string;
  first_name?: string | null;
  last_name?: string | null;
  campus_tag?: string | null;
  major_tag?: string | null;
  level?: number | null;
  bio?: string | null;
  hobbies?: string[] | null;
  degree?: string | null;
  description?: string | null;
  website?: string | null;
  phone_number?: string | null;
  contact_email?: string | null;
  social_links?: Record<string, unknown> | null;
  engagement_score?: number | null;
  earnings_balance?: string | null;
  monetization_enabled?: boolean | null;
  top_gist_id?: string | null;
  [key: string]: unknown;
}

/** The account half of GET /idiot/users/:account_id — KamposBackend's
 * PublicAccount (accounts table minus password_hash), same shape
 * serverAdmins.ts's AdminSummary already assumes. */
export interface AccountDetailRow {
  account_id: string;
  email: string;
  role: "user" | "idiot" | "king";
  account_status?: "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "DELETED";
  /** Set on admin-triggered suspend — quoted back to the owner in the
   * login-blocked message. Absent for self-deactivate/delete, which don't
   * carry one. */
  account_status_reason?: string | null;
  is_otp_verified?: boolean;
  created_at?: string;
  last_login?: string | null;
  [key: string]: unknown;
}

export interface AccountDetail {
  account: AccountDetailRow;
  profiles: AccountProfileRow[];
}

/**
 * Server-side fetch for the Users search page's initial (unfiltered) load —
 * same "forward the incoming cookie, hit the backend directly, return []
 * on any failure" pattern as listAdmins()/listPendingGists(). Filtering,
 * paging, and re-searching beyond this first page all happen client-side
 * through userManagementStore, same split AdminsManager/ModerationManager
 * already use for their own post-initial-load actions.
 */
export async function searchUsers(filters: UserSearchFilters = {}): Promise<AccountSearchRow[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/idiot/users?${buildUserSearchQuery(filters)}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: AccountSearchRow[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Server-side fetch for the account detail page. Returns null on any
 * failure (404 included) so the page can render a "not found" state
 * instead of crashing — same reasoning as fetchStudentProfileByAvitag.
 */
export async function getAccountDetail(accountId: string): Promise<AccountDetail | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/idiot/users/${accountId}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: AccountDetail };
    return json.data ?? null;
  } catch {
    return null;
  }
}
