import type { AdminGistFilters } from "./serverGistsAdmin";

/**
 * Shared query-string builder for GET /idiot/gists — used by BOTH
 * serverGistsAdmin.ts's server-side fetcher (Node runtime, imports
 * next/headers) and allGistsStore's client-side fetch (browser runtime), so
 * the two never drift on param names. Kept in its own file, separate from
 * serverGistsAdmin.ts itself, for the exact same reason userSearchQuery.ts
 * is split out from serverUsers.ts: importing anything but a TYPE from a
 * file that imports next/headers drags that file's whole module (and
 * next/headers with it) into the client bundle, which Next's bundler
 * rejects outright ("You're importing a module that depends on
 * next/headers... in the Pages Router") the moment a Client Component's
 * dependency graph reaches it — exactly what allGistsStore.ts hit before
 * this was split out.
 */
export function buildAdminGistQuery(filters: AdminGistFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.campus_tag) params.set("campus_tag", filters.campus_tag);
  if (filters.avitag) params.set("avitag", filters.avitag);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}
