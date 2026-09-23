import { cookies } from "next/headers";
import { env } from "./env";
import { buildAdminSpotQuery } from "./adminSpotQuery";

export { buildAdminSpotQuery };

/**
 * Types + server-side list-fetcher for /villagepeople/spots (the "browse
 * every Spot regardless of status" screen). Confirmed directly against
 * KamposBackend's idiot/spots.repo.ts's AdminSpotRow — this endpoint was
 * built alongside this file, not guessed at (unlike serverGistsAdmin.ts's
 * own written-ahead-of-the-backend caveat).
 */

export type AdminSpotStatus = "DRAFT" | "ACTIVE" | "REJECTED" | "REMOVED";

export interface AdminSpot {
  spot_id: string;
  avitag: string;
  profile_type: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  status: AdminSpotStatus;
  is_reported: boolean;
  created_at: string;
  display_name: string | null;
  image_url: string | null;
  campus_tag: string | null;
  major_tag: string | null;
  level: number | null;
  reactions_count: number;
  comments_count: number;
  views_count: number;
  reports_count: number;
  shares_count: number;
}

export interface AdminSpotFilters {
  status?: AdminSpotStatus | "";
  search?: string;
  /** Scopes to one poster's own Spots — used by the profile-view page's
   * Spots section (AllSpotsManager's own `avitag` prop). */
  avitag?: string;
  /** The last-seen spot's own spot_id — NOT an offset number. */
  cursor?: string;
  limit?: number;
}

/**
 * Server-side fetch for the All Spots screen's initial (unfiltered) load —
 * same "forward the incoming cookie, hit the backend directly, return []
 * on any failure" pattern as listGists(). Every filter change or scroll
 * continuation from here on goes through allSpotsStore's client-side
 * fetchSpots instead.
 */
export async function listSpots(filters: AdminSpotFilters = {}): Promise<{ spots: AdminSpot[]; total?: number }> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const query = buildAdminSpotQuery(filters);
    const res = await fetch(`${env.API_BASE}/idiot/spots${query ? `?${query}` : ""}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return { spots: [] };
    const json = (await res.json()) as { data?: AdminSpot[]; total?: number };
    return { spots: json.data ?? [], total: json.total };
  } catch {
    return { spots: [] };
  }
}
