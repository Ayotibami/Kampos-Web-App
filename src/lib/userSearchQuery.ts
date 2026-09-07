import type { UserSearchFilters } from "./serverUsers";

/**
 * Shared query-string builder for GET /idiot/users — used by BOTH
 * serverUsers.ts's server-side fetcher (Node runtime, imports next/headers)
 * and userManagementStore's client-side re-search (browser runtime), so the
 * two never drift on param names. Kept in its own file, separate from
 * serverUsers.ts itself, specifically so the client store can import this
 * one real function without also pulling next/headers into the client
 * bundle — importing anything but a type from serverUsers.ts drags its
 * whole module (and next/headers with it) along, which Next's bundler
 * rejects outright ("You're importing a module that depends on
 * next/headers... in the Pages Router") the moment a Client Component's
 * dependency graph reaches it.
 */
export function buildUserSearchQuery(filters: UserSearchFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.role) params.set("role", filters.role);
  if (filters.account_status) params.set("account_status", filters.account_status);
  if (filters.no_profile) params.set("no_profile", "true");
  params.set("limit", String(filters.limit ?? 20));
  params.set("offset", String(filters.offset ?? 0));
  return params.toString();
}
