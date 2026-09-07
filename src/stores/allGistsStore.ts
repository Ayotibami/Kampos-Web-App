import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { buildAdminGistQuery } from "@/lib/adminGistQuery";
import type { AdminGist, AdminGistFilters } from "@/lib/serverGistsAdmin";

interface AllGistsState {
  loading: boolean;
  error: string | null;
  /** GET /idiot/gists — used for both a fresh filter search (no cursor) and
   * a scroll continuation (cursor = the last-seen gist's own gist_id). See
   * serverGistsAdmin.ts's own doc for the full assumed-contract caveat. */
  fetchGists: (filters: AdminGistFilters) => Promise<AdminGist[]>;
  approveGist: (gistId: string) => Promise<AdminGist | undefined>;
  rejectGist: (gistId: string, reason?: string) => Promise<AdminGist | undefined>;
  deleteGist: (gistId: string) => Promise<void>;
}

/**
 * Client-side counterpart to lib/serverGistsAdmin.ts for /villagepeople/gists
 * (the "browse every gist regardless of status" screen). Kept as its own
 * store rather than folded into moderationStore.ts — that store's whole
 * shape (fetchGists always re-querying from offset 0 with a growing limit)
 * is built around a queue that SHRINKS as an admin works it; this screen is
 * a plain browse/search over every gist, which doesn't shrink just by
 * looking at it and gets a real cursor from the backend, so it needs its
 * own, differently-shaped fetch — mirrors the userManagementStore vs
 * moderationStore split already in place for Groups B/C.
 *
 * approve/reject reuse the EXACT SAME /idiot/moderation/gists/:id/approve
 * and .../reject endpoints moderationStore.ts already calls — a gist's
 * status is the same underlying thing whether you're looking at it from the
 * pending queue or from this browse screen, so there's no reason for a
 * second implementation of either call. "Unapprove" (see AdminGistCard) is
 * just the reject call under a different label, not a different endpoint.
 */
export const useAllGistsStore = create<AllGistsState>((set) => ({
  loading: false,
  error: null,

  fetchGists: async (filters) => {
    const query = buildAdminGistQuery(filters);
    const res = await api.get<ApiEnvelope<AdminGist[]>>(`/idiot/gists${query ? `?${query}` : ""}`);
    return res.data?.data ?? [];
  },

  approveGist: async (gistId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<AdminGist>>(
        `/idiot/moderation/gists/${gistId}/approve`,
      );
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to approve this gist"), loading: false });
      throw err;
    }
  },

  rejectGist: async (gistId, reason) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<AdminGist>>(
        `/idiot/moderation/gists/${gistId}/reject`,
        reason ? { reason } : {},
      );
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to reject this gist"), loading: false });
      throw err;
    }
  },

  deleteGist: async (gistId) => {
    set({ loading: true, error: null });
    try {
      // Same DELETE /gists/:gist_id shape gistStore.ts's own remove() calls
      // — confirmed directly against KamposBackend's gist.controller.ts
      // `remove` handler, which branches on isAdminRole(req.user?.role) and
      // calls GistService.deleteAsIdiot(id) with NO ownership check for an
      // admin caller (only a plain user is restricted to deleteByOwner), so
      // this same call already works for deleting ANY gist as an admin —
      // no separate admin-only delete endpoint needed.
      await api.delete(`/gists/${encodeURIComponent(gistId)}`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete this gist"), loading: false });
      throw err;
    }
  },
}));
