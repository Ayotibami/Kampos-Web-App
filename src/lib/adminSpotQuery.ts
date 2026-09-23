import type { AdminSpotFilters } from "./serverSpotsAdmin";

/**
 * Shared query-string builder for GET /idiot/spots — used by BOTH
 * serverSpotsAdmin.ts's server-side fetcher (Node runtime, imports
 * next/headers) and allSpotsStore's client-side fetch (browser runtime), so
 * the two never drift on param names. Split out from serverSpotsAdmin.ts
 * itself for the exact same reason adminGistQuery.ts is split from
 * serverGistsAdmin.ts — importing anything but a TYPE from a file that
 * imports next/headers drags that file's whole module into the client
 * bundle, which Next's bundler rejects outright.
 */
export function buildAdminSpotQuery(filters: AdminSpotFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.avitag) params.set("avitag", filters.avitag);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}
