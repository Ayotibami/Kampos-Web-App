import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { AdminSummary } from "@/lib/serverAdmins";

export type { AdminSummary };

interface AdminState {
  loading: boolean;
  error: string | null;
  /** Client-side re-fetch of the same list serverAdmins.ts's listAdmins()
   * loads for the page's first render — used after a grant/revoke so the
   * table reflects the backend's own resulting state rather than a locally
   * guessed splice/append. */
  refreshAdmins: () => Promise<AdminSummary[]>;
  grantAdmin: (accountId: string) => Promise<void>;
  revokeAdmin: (accountId: string) => Promise<void>;
}

/**
 * Client-side counterpart to lib/serverAdmins.ts — same /idiot/admins
 * endpoints, called through the shared `api` axios client (this app's
 * same-origin proxy) instead of a direct server-to-server fetch. Kept as
 * its own small store rather than folded into profileStore/authStore,
 * matching this codebase's one-store-per-concern convention (see
 * profileStore, commentStore, gistStore) — /villagepeople is its own
 * concern, unrelated to the consumer-facing app those stores serve.
 *
 * grant/revoke both take `{ account_id }` and reply with just
 * `{ message }` (no `data`) — confirmed against KamposBackend's
 * admins.controller.ts. Note that route is king-only end-to-end (a plain
 * 'idiot' admin gets a 403 from the backend itself, not just a hidden
 * nav link) — every caller into this store is already behind this app's
 * own king-only gate on /villagepeople/admins, so that 403 should only
 * ever surface here from a stale session (e.g. a king who got revoked
 * mid-visit).
 */
export const useAdminStore = create<AdminState>((set) => ({
  loading: false,
  error: null,

  refreshAdmins: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<ApiEnvelope<AdminSummary[]>>("/idiot/admins");
      const admins = res.data?.data ?? [];
      set({ loading: false });
      return admins;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load admins"), loading: false });
      throw err;
    }
  },

  grantAdmin: async (accountId) => {
    set({ loading: true, error: null });
    try {
      await api.post("/idiot/admins/grant", { account_id: accountId });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to grant admin"), loading: false });
      throw err;
    }
  },

  revokeAdmin: async (accountId) => {
    set({ loading: true, error: null });
    try {
      await api.post("/idiot/admins/revoke", { account_id: accountId });
      set({ loading: false });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to revoke admin"), loading: false });
      throw err;
    }
  },
}));
