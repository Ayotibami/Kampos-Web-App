import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { PendingGist, PendingProfile, PendingReport, PendingSpotReport } from "@/lib/serverModeration";

interface ModerationState {
  loading: boolean;
  error: string | null;
  approveGist: (gistId: string) => Promise<PendingGist | undefined>;
  rejectGist: (gistId: string, reason?: string) => Promise<PendingGist | undefined>;
  verifyProfile: (avitag: string) => Promise<void>;
  rejectProfile: (avitag: string, reason?: string) => Promise<void>;
  acceptReport: (reportId: string) => Promise<void>;
  rejectReport: (reportId: string, reason?: string) => Promise<void>;
  acceptSpotReport: (reportId: string) => Promise<void>;
  rejectSpotReport: (reportId: string, reason?: string) => Promise<void>;
  /**
   * "Load more" for each tab — always re-fetches from offset 0 with a
   * growing `limit`, never a growing `offset`. These three queues shrink as
   * an admin works them (every approve/reject/accept/dismiss removes an
   * item from the server's own pending set), so a normal "next page" offset
   * would silently skip whatever slid up into the range you already saw.
   * Re-fetching the whole list from the top with a bigger limit is immune
   * to that — cheap at this queue's realistic scale, and it also means the
   * refreshed list reflects the current server truth (e.g. another admin's
   * actions in the meantime), not just "more of what I already had".
   */
  fetchGists: (limit: number) => Promise<PendingGist[]>;
  fetchReports: (limit: number) => Promise<PendingReport[]>;
  fetchProfiles: (limit: number) => Promise<PendingProfile[]>;
  fetchSpotReports: (limit: number) => Promise<PendingSpotReport[]>;
}

/**
 * Client-side counterpart to lib/serverModeration.ts — same
 * /idiot/moderation endpoints, called through the shared `api` axios client
 * rather than a direct server-to-server fetch, same split as adminStore.ts
 * vs serverAdmins.ts. Kept as its own store (not folded into adminStore)
 * since moderation is a separate concern from account/role management, and
 * — unlike admins/grant-revoke, which is king-only end-to-end — every
 * method here is reachable by any admin ('idiot' or 'king'), matching the
 * backend's own isAuth+isIdiot gate on these routes.
 *
 * `loading`/`error` are kept for shape-parity with adminStore.ts, but (same
 * as AdminsManager.tsx already does for grant/revoke) the three tab
 * components each track their own per-row "which item is this button
 * currently acting on" state locally rather than reading this store's
 * single global `loading` flag — a list of many rows needs per-row pending
 * state, not one flag for the whole screen.
 *
 * approve/reject-gist are typed as returning the updated PendingGist per the
 * written contract ("both return the updated gist or 404"), but nothing
 * here actually needs that payload back — the caller removes the row
 * locally on success regardless of what comes back. verify/reject-profile
 * and accept/reject-report return no meaningful `data` per the contract
 * (reject-profile explicitly doesn't change any visible state), so those
 * are typed as `void`.
 */
export const useModerationStore = create<ModerationState>((set) => ({
  loading: false,
  error: null,

  approveGist: async (gistId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<PendingGist>>(
        `/idiot/moderation/gists/${gistId}/approve`,
      );
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to approve post"), loading: false });
      throw err;
    }
  },

  rejectGist: async (gistId, reason) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<PendingGist>>(
        `/idiot/moderation/gists/${gistId}/reject`,
        reason ? { reason } : {},
      );
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to reject post"), loading: false });
      throw err;
    }
  },

  verifyProfile: async (avitag) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/moderation/profiles/${avitag}/verify`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to verify profile"), loading: false });
      throw err;
    }
  },

  rejectProfile: async (avitag, reason) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/moderation/profiles/${avitag}/reject`, reason ? { reason } : {});
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to log profile review"), loading: false });
      throw err;
    }
  },

  acceptReport: async (reportId) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/moderation/reports/${reportId}/accept`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to accept report"), loading: false });
      throw err;
    }
  },

  rejectReport: async (reportId, reason) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/moderation/reports/${reportId}/reject`, reason ? { reason } : {});
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to dismiss report"), loading: false });
      throw err;
    }
  },

  acceptSpotReport: async (reportId) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/moderation/spot-reports/${reportId}/accept`);
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to accept report"), loading: false });
      throw err;
    }
  },

  rejectSpotReport: async (reportId, reason) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/idiot/moderation/spot-reports/${reportId}/reject`, reason ? { reason } : {});
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to dismiss report"), loading: false });
      throw err;
    }
  },

  fetchGists: async (limit) => {
    const res = await api.get<ApiEnvelope<PendingGist[]>>(
      `/idiot/moderation/gists?limit=${limit}&offset=0`,
    );
    return res.data?.data ?? [];
  },

  fetchReports: async (limit) => {
    const res = await api.get<ApiEnvelope<PendingReport[]>>(
      `/idiot/moderation/reports?limit=${limit}&offset=0`,
    );
    return res.data?.data ?? [];
  },

  fetchProfiles: async (limit) => {
    const res = await api.get<ApiEnvelope<PendingProfile[]>>(
      `/idiot/moderation/profiles?limit=${limit}&offset=0`,
    );
    return res.data?.data ?? [];
  },

  fetchSpotReports: async (limit) => {
    const res = await api.get<ApiEnvelope<PendingSpotReport[]>>(
      `/idiot/moderation/spot-reports?limit=${limit}&offset=0`,
    );
    return res.data?.data ?? [];
  },
}));
