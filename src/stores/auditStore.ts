import { create } from "zustand";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { AuditLogFilters, AuditLogRow } from "@/lib/auditActions";

interface AuditState {
  loading: boolean;
  error: string | null;
  /** Client-side re-fetch — used for every filter change/"Load more" after
   * the server page's own initial unfiltered load, same split as every
   * other Group B/C store this admin section already has (moderationStore,
   * userManagementStore, ...). */
  fetchLogs: (filters: AuditLogFilters) => Promise<AuditLogRow[]>;
}

export const useAuditStore = create<AuditState>((set) => ({
  loading: false,
  error: null,

  fetchLogs: async (filters) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set("action", filters.action);
      if (filters.search) params.set("search", filters.search);
      if (filters.cursor) params.set("cursor", filters.cursor);
      params.set("limit", String(filters.limit ?? 30));

      const res = await api.get<ApiEnvelope<AuditLogRow[]>>(`/idiot/audit?${params.toString()}`);
      const rows = res.data?.data ?? [];
      set({ loading: false });
      return rows;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load activity log"), loading: false });
      throw err;
    }
  },
}));
