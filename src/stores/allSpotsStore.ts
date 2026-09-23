import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { buildAdminSpotQuery } from "@/lib/adminSpotQuery";
import type { AdminSpot, AdminSpotFilters } from "@/lib/serverSpotsAdmin";

interface AllSpotsState {
  loading: boolean;
  error: string | null;
  /** GET /idiot/spots — used for both a fresh filter search (no cursor) and
   * a scroll continuation (cursor = the last-seen spot's own spot_id). */
  fetchSpots: (filters: AdminSpotFilters) => Promise<{ spots: AdminSpot[]; total?: number }>;
  /** Take-down — the soft moderation action (status flip to REJECTED, no
   * approve/unapprove pair since Spot has no pending-approval state to
   * begin with). Reuses the exact same DELETE /spots/:spot_id gistStore's
   * consumer remove() also calls — confirmed against spot.controller.ts's
   * `remove`, which branches on isAdminRole and calls
   * SpotRepo.rejectAsAdmin with no ownership check for an admin caller. */
  takeDownSpot: (spotId: string, reason?: string) => Promise<void>;
  /** The genuine hard delete — a real DELETE FROM spots, not a status flip.
   * A DIFFERENT endpoint (DELETE /idiot/spots/:id, admin-only) than
   * takeDownSpot's above — see spots.routes.ts's own comment on why that
   * one stays untouched rather than being repurposed. */
  hardDeleteSpot: (spotId: string, reason?: string) => Promise<void>;
  /** Undoes an admin's own Take Down (REJECTED -> ACTIVE only — see
   * SpotRepo.reactivateAsAdmin's own doc for why REMOVED, the poster's own
   * self-delete, is never reversed this way). No reason param, matching
   * Gist's own approveGist — undoing your own action doesn't need
   * justifying the way taking something down does. */
  reactivateSpot: (spotId: string) => Promise<void>;
}

/**
 * Client-side counterpart to lib/serverSpotsAdmin.ts for /villagepeople/spots
 * (the "browse every Spot regardless of status" screen) — mirrors
 * allGistsStore.ts's own shape and split-out reasoning exactly.
 */
export const useAllSpotsStore = create<AllSpotsState>((set) => ({
  loading: false,
  error: null,

  fetchSpots: async (filters) => {
    const query = buildAdminSpotQuery(filters);
    const res = await api.get<ApiEnvelope<AdminSpot[]> & { total?: number }>(`/idiot/spots${query ? `?${query}` : ""}`);
    return { spots: res.data?.data ?? [], total: res.data?.total };
  },

  takeDownSpot: async (spotId, reason) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/spots/${encodeURIComponent(spotId)}`, reason ? { data: { reason } } : undefined);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to take down this Spot"), loading: false });
      throw err;
    }
  },

  hardDeleteSpot: async (spotId, reason) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/idiot/spots/${encodeURIComponent(spotId)}`, reason ? { data: { reason } } : undefined);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete this Spot"), loading: false });
      throw err;
    }
  },

  reactivateSpot: async (spotId) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/spots/${encodeURIComponent(spotId)}/reactivate`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to reactivate this Spot"), loading: false });
      throw err;
    }
  },
}));
