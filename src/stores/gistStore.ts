import { create } from "zustand";
import axios from "axios";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { uploadToCloudinaryDirect, type CloudinarySignature, type CloudinaryUploadResult } from "@/lib/cloudinary";
import type { Gist, GistCounts, ReactionType } from "@/types";

/** Which of the three legs of a direct-to-Cloudinary upload failed — lets
 * `CreateGistSheet` show a genuinely specific, brand-voice message per
 * stage instead of one generic "upload failed" for every possible cause. */
export type MediaUploadStage = "signature" | "upload" | "finalize";
export class MediaUploadError extends Error {
  stage: MediaUploadStage;
  constructor(stage: MediaUploadStage, message: string) {
    super(message);
    this.stage = stage;
  }
}

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
    shares_count: Number(raw.shares_count ?? raw.counts?.shares_count ?? 0),
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
  /** A specific user's gists (profile page) — deliberately does NOT touch
   * `items`/`loading` like list()/trending() do. Those two back the main
   * feed; sharing state with them here would mean visiting a profile page
   * and returning to the feed shows stale/wrong gists until a refetch.
   * Matches get()/getContext()/counts()'s own read-only pattern below. */
  byUser: (avitag: string, params?: { limit?: number; cursor?: string }) => Promise<Gist[]>;
  get: (gistId: string) => Promise<Gist | undefined>;
  /** The shared-link view: one target gist (any status — including a
   * removed/rejected one, which the caller renders its own "removed"
   * state for) plus chronological neighbors on each side. Doesn't touch
   * `items`/`loading` — this feeds a standalone page's own local state,
   * not the main feed list. */
  getContext: (
    gistId: string,
    before?: number,
    after?: number,
  ) => Promise<{ target: Gist; before: Gist[]; after: Gist[] } | undefined>;
  counts: (gistId: string) => Promise<GistCounts | undefined>;
  create: (payload: { gist_text: string; [key: string]: unknown }) => Promise<Gist | undefined>;
  update: (gistId: string, gistText: string) => Promise<Gist | undefined>;
  /** Uploads straight from the browser to Cloudinary (see cloudinary.ts) —
   * `onProgress` (0-100) fires only during the actual upload leg, not the
   * signature/finalize round trips either side of it, which are near-
   * instant by comparison. Throws `MediaUploadError` with a `.stage` so
   * callers can show a specific reason per failure point. */
  uploadMedia: (gistId: string, file: Blob, name?: string, onProgress?: (percent: number) => void) => Promise<unknown>;
  /** GIF/sticker attachment (GIPHY) — the URL is already hosted on GIPHY's
   * CDN, so this just records it against the gist, no file upload. */
  attachMediaUrl: (gistId: string, url: string) => Promise<unknown>;
  /** Removes one piece of media from a gist — used when editing an
   * existing post, not just at create time. */
  removeMedia: (mediaId: string) => Promise<void>;
  remove: (gistId: string) => Promise<void>;
  report: (gistId: string, reason?: string) => Promise<void>;
  view: (gistId: string) => Promise<void>;
  /** Logs a real share event — call this once a share actually goes out
   * (a platform link opened, copy-link/native-share completed), not just
   * when the share sheet is opened. `platform` is optional/free-form. */
  share: (gistId: string, platform?: string) => Promise<void>;
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

  byUser: async (avitag, params) => {
    return normalizeGists(
      (await apiGet<Gist[]>(`/gists/user/${encodeURIComponent(avitag)}`, { params })) ?? [],
    );
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

  getContext: async (gistId, before = 15, after = 15) => {
    try {
      const data = await apiGet<{ target: Gist; before: Gist[]; after: Gist[] }>(
        `/gists/${encodeURIComponent(gistId)}/context`,
        { params: { before, after } },
      );
      if (!data) return data;
      return {
        target: normalizeGist(data.target),
        before: normalizeGists(data.before),
        after: normalizeGists(data.after),
      };
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
      // PATCH, not PUT — the backend only registers this route as PATCH
      // (a partial update, which is what this actually is: gist_text
      // alone, not the whole resource). PUT silently 404s since Express
      // never matches it to the PATCH-only route, and the generic 404
      // handler's plain "Not Found" doesn't even hint at why.
      const res = await api.patch<ApiEnvelope<Gist>>(`/gists/${encodeURIComponent(gistId)}`, {
        gist_text: gistText,
      });
      return res.data?.data;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to update gist") });
      throw err;
    }
  },

  uploadMedia: async (gistId, file, name = "media", onProgress) => {
    const isVideo = file.type.startsWith("video/");

    let sig: CloudinarySignature;
    try {
      const res = await api.get<ApiEnvelope<CloudinarySignature>>(
        `/gists/${encodeURIComponent(gistId)}/media/signature`,
        { params: isVideo ? { resource_type: "video" } : undefined },
      );
      if (!res.data?.data) throw new Error("No signature returned");
      sig = res.data.data;
    } catch (err) {
      // 429 is Kampos's own rate limiter, not a dropped connection — the
      // generic "check your connection" copy this used to fall back to was
      // actively misleading here, since the request reached the server fine.
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        throw new MediaUploadError("signature", "Too many uploads at once — wait a few seconds and try again.");
      }
      throw new MediaUploadError("signature", apiErrorMessage(err, "Couldn't start the upload"));
    }

    let result: CloudinaryUploadResult;
    try {
      result = await uploadToCloudinaryDirect(file, name, sig, onProgress);
    } catch (err) {
      throw new MediaUploadError("upload", err instanceof Error ? err.message : "Upload failed");
    }

    try {
      const res = await api.post<ApiEnvelope<unknown>>(`/gists/${encodeURIComponent(gistId)}/media/finalize`, {
        media_url: result.secure_url,
        public_id: result.public_id,
        resource_type: result.resource_type,
        bytes: result.bytes,
        duration: result.duration,
        width: result.width,
        height: result.height,
        thumbnail_url: result.eager?.[0]?.secure_url,
      });
      return res.data?.data;
    } catch (err) {
      throw new MediaUploadError("finalize", apiErrorMessage(err, "Couldn't save the upload"));
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

  removeMedia: async (mediaId) => {
    try {
      await api.delete(`/gists/media/${encodeURIComponent(mediaId)}`);
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to remove media") });
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

  share: async (gistId, platform) => {
    try {
      await api.post(`/gists/${encodeURIComponent(gistId)}/share`, platform ? { platform } : {});
    } catch {
      /* share tracking is best-effort; never block/interrupt the actual share */
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
