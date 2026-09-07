/**
 * Shared query-string builder for GET /idiot/profiles/<type> (all 5 profile
 * types) — used by BOTH serverProfilesAdmin.ts's server-side fetchers (Node
 * runtime, imports next/headers) and profilesAdminStore's client-side
 * re-search/scroll-continuation (browser runtime), so the two never drift on
 * param names. Kept in its own file, separate from serverProfilesAdmin.ts
 * itself, for the exact same reason userSearchQuery.ts/adminGistQuery.ts are
 * split out from their own serverX.ts files: importing anything but a TYPE
 * from a file that imports next/headers drags that file's whole module (and
 * next/headers with it) into the client bundle, which Next's bundler rejects
 * outright the moment a Client Component's dependency graph reaches it.
 *
 * One generic builder covers all 5 types (rather than 5 near-identical
 * copies) since every type-specific filter set is a subset of the same
 * field list — search/profile_status/is_verified/cursor/limit are common to
 * all, campus_tag/major_tag/level only apply where the type actually has
 * them (a caller simply never sets a field its type doesn't have).
 */
export interface ProfileAdminFilters {
  search?: string;
  profile_status?: string;
  /** A dropdown value, not a real boolean — "" means "All", so the param is
   * omitted entirely rather than sent as the string "". */
  is_verified?: "" | "true" | "false";
  campus_tag?: string;
  major_tag?: string;
  level?: string | number;
  /** The last-seen row's own `avitag` — NOT an offset number. Same scheme
   * AllGistsManager.tsx/serverGistsAdmin.ts already use for their own
   * cursor-based infinite scroll. */
  cursor?: string;
  limit?: number;
}

export function buildProfileAdminQuery(filters: ProfileAdminFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.profile_status) params.set("profile_status", filters.profile_status);
  if (filters.is_verified) params.set("is_verified", filters.is_verified);
  if (filters.campus_tag) params.set("campus_tag", filters.campus_tag);
  if (filters.major_tag) params.set("major_tag", filters.major_tag);
  if (filters.level !== undefined && filters.level !== "") params.set("level", String(filters.level));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}
