import { create } from "zustand";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import type { Gist, GistCounts, ReactionType } from "@/types";

/**
 * The backend returns reactions_count/comments_count/views_count/
 * reports_count as flat fields directly on each gist row (see
 * KamposBackend/src/modules/gist/gist.repo.ts) — but the rest of the
 * frontend (GistCard etc.) reads them nested under `gist.counts`. Without
 * this, every count silently read as undefined → rendered as 0, even
 * though the raw data was right there under a different shape.
 */
function normalizeGist(raw: Gist): Gist {
  const counts: GistCounts = {
    reactions_count: Number(raw.reactions_count ?? raw.counts?.reactions_count ?? 0),
    comments_count: Number(raw.comments_count ?? raw.counts?.comments_count ?? 0),
    views_count: Number(raw.views_count ?? raw.counts?.views_count ?? 0),
    reports_count: Number(raw.reports_count ?? raw.counts?.reports_count ?? 0),
    reactions_by_type: (raw.reactions_by_type as GistCounts["reactions_by_type"]) ?? raw.counts?.reactions_by_type,
  };
  return { ...raw, counts };
}
function normalizeGists(raw: Gist[]): Gist[] {
  return raw.map(normalizeGist);
}

interface GistState {
  items: Gist[];
  loading: boolean;
  error: string | null;

  list: (params?: Record<string, unknown>) => Promise<Gist[]>;
  trending: () => Promise<Gist[]>;
  byUser: (avitag: string) => Promise<Gist[]>;
  get: (gistId: string) => Promise<Gist | undefined>;
  counts: (gistId: string) => Promise<GistCounts | undefined>;
  create: (payload: { gist_text: string; [key: string]: unknown }) => Promise<Gist | undefined>;
  update: (gistId: string, gistText: string) => Promise<Gist | undefined>;
  uploadMedia: (gistId: string, file: Blob, name?: string) => Promise<unknown>;
  /** GIF/sticker attachment (GIPHY) — the URL is already hosted on GIPHY's
   * CDN, so this just records it against the gist, no file upload. */
  attachMediaUrl: (gistId: string, url: string) => Promise<unknown>;
  remove: (gistId: string) => Promise<void>;
  report: (gistId: string, reason?: string) => Promise<void>;
  view: (gistId: string) => Promise<void>;
  react: (gistId: string, type: ReactionType) => Promise<void>;
  unreact: (gistId: string) => Promise<void>;
}

export const useGistStore = create<GistState>((set) => ({
  items: [],
  loading: false,
  error: null,

  list: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const data = normalizeGists((await apiGet<Gist[]>("/gists", { params })) ?? []);
      set({ items: data, loading: false });
      return data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load gists"), loading: false });
      throw err;
    }
  },

  trending: async () => {
    set({ loading: true, error: null });
    try {
      const data = normalizeGists((await apiGet<Gist[]>("/gists/trending")) ?? []);
      set({ items: data, loading: false });
      return data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load trending"), loading: false });
      throw err;
    }
  },

  byUser: async (avitag) => {
    set({ loading: true, error: null });
    try {
      const data = normalizeGists((await apiGet<Gist[]>(`/gists/user/${encodeURIComponent(avitag)}`)) ?? []);
      set({ items: data, loading: false });
      return data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load user gists"), loading: false });
      throw err;
    }
  },

  get: async (gistId) => {
    try {
      const data = await apiGet<Gist>(`/gists/${encodeURIComponent(gistId)}`);
      return data ? normalizeGist(data) : data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load gist") });
      throw err;
    }
  },

  counts: async (gistId) => {
    try {
      return await apiGet<GistCounts>(`/gists/${encodeURIComponent(gistId)}/counts`);
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load counts") });
      throw err;
    }
  },

  create: async (payload) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<Gist>>("/gists", payload);
      set({ loading: false });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to create gist"), loading: false });
      throw err;
    }
  },

  update: async (gistId, gistText) => {
    try {
      const res = await api.put<ApiEnvelope<Gist>>(`/gists/${encodeURIComponent(gistId)}`, {
        gist_text: gistText,
      });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update gist") });
      throw err;
    }
  },

  uploadMedia: async (gistId, file, name = "media") => {
    const fd = new FormData();
    fd.append("file", file, name);
    try {
      const res = await api.post<ApiEnvelope<unknown>>(
        `/gists/${encodeURIComponent(gistId)}/media`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Media upload failed") });
      throw err;
    }
  },

  attachMediaUrl: async (gistId, url) => {
    try {
      const res = await api.post<ApiEnvelope<unknown>>(`/gists/${encodeURIComponent(gistId)}/media/url`, {
        media_url: url,
      });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to attach GIF") });
      throw err;
    }
  },

  remove: async (gistId) => {
    try {
      await api.delete(`/gists/${encodeURIComponent(gistId)}`);
      set((s) => ({ items: s.items.filter((g) => g.gist_id !== gistId) }));
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete gist") });
      throw err;
    }
  },

  report: async (gistId, reason) => {
    try {
      await api.post(`/gists/${encodeURIComponent(gistId)}/report`, reason ? { reason } : {});
    } catch (err) {
      set({ error: apiErrorMessage(err, "Report failed") });
      throw err;
    }
  },

  view: async (gistId) => {
    try {
      await api.post(`/gists/${encodeURIComponent(gistId)}/view`);
    } catch {
      /* view tracking is best-effort; never surface an error */
    }
  },

  react: async (gistId, type) => {
    // Optimistic — the total metric row reads gist.counts.reactions_count
    // from this cached item, which a bare POST to /reactions never touched
    // before, so it sat frozen until the next full refetch even though the
    // backend total was already correct. Count only grows the first time
    // you react (switching type later doesn't add a second reaction),
    // matching how comment reactions already behave.
    let previous: Gist | undefined;
    set((s) => ({
      items: s.items.map((g) => {
        if (g.gist_id !== gistId) return g;
        previous = g;
        return {
          ...g,
          my_reaction: type,
          counts: {
            ...(g.counts ?? { reactions_count: 0, comments_count: 0, views_count: 0, reports_count: 0 }),
            reactions_count: (g.counts?.reactions_count ?? 0) + (g.my_reaction ? 0 : 1),
          },
        };
      }),
    }));
    try {
      await api.post("/reactions", { entity_type: "GIST", entity_id: gistId, type });
    } catch (err) {
      // Roll back — without this, a failed request (most commonly: not
      // actually authenticated, since this endpoint requires real auth
      // unlike the list/get endpoints) left the UI showing a reaction that
      // was never actually saved, and it'd silently vanish on next reload
      // with no indication anything had gone wrong.
      if (previous) {
        set((s) => ({ items: s.items.map((g) => (g.gist_id === gistId ? previous! : g)) }));
      }
      set({ error: apiErrorMessage(err, "Failed to react") });
      throw err;
    }
  },

  unreact: async (gistId) => {
    // Optimistic, mirroring react() above — clears the active pill and
    // drops the count immediately instead of waiting on the round trip.
    let previous: Gist | undefined;
    set((s) => ({
      items: s.items.map((g) => {
        if (g.gist_id !== gistId) return g;
        previous = g;
        return {
          ...g,
          my_reaction: null,
          counts: {
            ...(g.counts ?? { reactions_count: 0, comments_count: 0, views_count: 0, reports_count: 0 }),
            reactions_count: Math.max(0, (g.counts?.reactions_count ?? 0) - (g.my_reaction ? 1 : 0)),
          },
        };
      }),
    }));
    try {
      await api.delete(`/reactions/entity/GIST/${encodeURIComponent(gistId)}`);
    } catch (err) {
      // Roll back — same reasoning as react(): without this, a failed
      // delete left the UI showing "unreacted" for a reaction the backend
      // still has recorded, until the next refetch quietly brought it back.
      if (previous) {
        set((s) => ({ items: s.items.map((g) => (g.gist_id === gistId ? previous! : g)) }));
      }
      set({ error: apiErrorMessage(err, "Failed to remove reaction") });
      throw err;
    }
  },
}));
