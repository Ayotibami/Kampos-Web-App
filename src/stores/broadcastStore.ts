import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { BroadcastSummary } from "@/lib/serverBroadcasts";

export type { BroadcastSummary };

interface BroadcastState {
  loading: boolean;
  error: string | null;
  /** Lets the compose screen show "this will email N accounts" before the
   * king commits to anything irreversible. */
  fetchRecipientCount: () => Promise<number>;
  createBroadcast: (subject: string, message: string) => Promise<{ broadcast_id: string; total_recipients: number }>;
  /** Client-side re-fetch of the same list serverBroadcasts.ts's
   * listBroadcasts() loads for the page's first render — used after
   * sending a new one, and safe to call again later to watch a large
   * broadcast's pending_count drain over time. */
  refreshBroadcasts: () => Promise<BroadcastSummary[]>;
}

/**
 * Client-side counterpart to lib/serverBroadcasts.ts — /idiot/broadcasts is
 * king-only end-to-end (the backend itself 403s a plain idiot admin, not
 * just a hidden nav link), same trust model as adminStore.ts's grant/
 * revoke. Kept as its own store rather than folded into moderationStore —
 * "email every account" is its own concern, not a moderation action.
 */
export const useBroadcastStore = create<BroadcastState>((set) => ({
  loading: false,
  error: null,

  fetchRecipientCount: async () => {
    try {
      const res = await api.get<ApiEnvelope<{ count: number }>>("/idiot/broadcasts/recipient-count");
      return res.data?.data?.count ?? 0;
    } catch (err) {
      throw new Error(apiErrorMessage(err, "Failed to load recipient count"));
    }
  },

  createBroadcast: async (subject, message) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<{ broadcast_id: string; total_recipients: number }>>(
        "/idiot/broadcasts",
        { subject, message },
      );
      set({ loading: false });
      return res.data?.data ?? { broadcast_id: "", total_recipients: 0 };
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to send broadcast"), loading: false });
      throw err;
    }
  },

  refreshBroadcasts: async () => {
    try {
      const res = await api.get<ApiEnvelope<BroadcastSummary[]>>("/idiot/broadcasts");
      return res.data?.data ?? [];
    } catch (err) {
      throw new Error(apiErrorMessage(err, "Failed to load broadcasts"));
    }
  },
}));
