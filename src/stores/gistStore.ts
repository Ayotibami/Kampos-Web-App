import { create } from "zustand";
import axios from "axios";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { uploadToCloudinaryDirect, type CloudinarySignature, type CloudinaryUploadResult } from "@/lib/cloudinary";
import { cacheGet, cacheSet, cacheDeleteMatching } from "@/lib/dataCache";
import { enqueue } from "@/lib/offlineQueue";
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

const GIST_CACHE_TTL_MS = 5 * 60 * 1000;

// ── Cache helpers (Phase 2 — stale-while-revalidate) ────────────────────

/** Shared stale-while-revalidate read pattern used by list(), trending(),
 *  byUser(), get(), getContext(), and counts().
 *
 *  1. Check IndexedDB cache for `cacheKey`.
 *  2. If cached AND fresh (≤5 minutes old): return cached data immediately,
 *     then fire the real network fetch in the background so the cache is
 *     warm for the NEXT read without the user waiting.
 *  3. If stale or missing: fetch from network, cache the result, return it. */
async function cachedRead<T>(
  cacheKey: string,
  fetcher: () => Promise<T | undefined>,
  onFresh?: (fresh: T) => void,
): Promise<T | undefined> {
  const cached = await cacheGet<T>(cacheKey, GIST_CACHE_TTL_MS);
  if (cached !== null) {
    // Background refresh — fires the network call, then pushes fresh data
    // into both the cache AND (via onFresh) the store so the UI updates
    // without the user ever seeing a loading spinner.
    fetcher()
      .then((fresh) => {
        if (fresh !== undefined) {
          cacheSet(cacheKey, fresh);
          onFresh?.(fresh);
        }
      })
      .catch(() => {});
    return cached;
  }
  // No cache hit — must wait for the network.
  const fresh = await fetcher();
  if (fresh !== undefined) cacheSet(cacheKey, fresh);
  return fresh;
}

/** Build a stable cache key from a method name and its params. */
function cacheKey(method: string, params?: Record<string, unknown>): string {
  if (!params) return `GET:${method}`;
  // Sort keys so {a:1,b:2} and {b:2,a:1} produce the same cache entry.
  const sorted = Object.keys(params)
    .sort()
    .reduce(
      (acc, k) => {
        acc[k] = params[k];
        return acc;
      },
      {} as Record<string, unknown>,
    );
  return `GET:${method}?${JSON.stringify(sorted)}`;
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
   * CDN, so this just records it against the gist, no file upload.
   * width/height are GIPHY's own reported dimensions for that URL, same
   * purpose as what Cloudinary reports for uploaded media — optional since
   * they're only ever known for a fresh GIPHY pick. */
  attachMediaUrl: (gistId: string, url: string, width?: number | null, height?: number | null) => Promise<unknown>;
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
  /** Replay all offline-queued write mutations and invalidate the gist
   * cache so the next feed read includes them. Call this from
   * useNetworkStatus when coming back online. */
  flushOfflineQueue: () => Promise<void>;
  /** True when a background refresh fetched new gists and they're waiting
   * to be shown — the UI renders a "Check out new gists" pill. */
  hasNewGists: boolean;
  /** Swaps in the fresh gists that arrived via background refresh. */
  loadNewGists: () => void;
  /** Internal — the cache key from the last list() call, used by
   * loadNewGists to read the background-refreshed data from cache. */
  _lastListKey: string;
}

export const useGistStore = create<GistState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  hasNewGists: false,
  _lastListKey: "",

  list: async (params = {}) => {
    set({ loading: true, error: null, hasNewGists: false });
    const key = cacheKey("/gists", params);
    set({ _lastListKey: key });
    try {
      const data = await cachedRead<Gist[]>(key, () =>
        apiGet<Gist[]>("/gists", { params }),
        // When fresh gists arrive in the background, DON'T auto-replace.
        // Instead show a pill so the user isn't interrupted mid-scroll.
        (fresh) => {
          // Only show the pill if the fresh data is ACTUALLY different
          // from what's already on screen.  Otherwise the background
          // refresh just updates the cache silently — no reason to
          // interrupt the user for the exact same gists.
          const current = normalizeGists(get().items);
          const incoming = normalizeGists(fresh);
          const changed =
            current.length !== incoming.length ||
            current.some((g, i) => g.gist_id !== incoming[i]?.gist_id || g.gist_text !== incoming[i]?.gist_text || g.counts?.reactions_count !== incoming[i]?.counts?.reactions_count || g.counts?.comments_count !== incoming[i]?.counts?.comments_count);
          if (changed) {
            set({ hasNewGists: true });
          }
        },
      );
      const normalized = normalizeGists(data ?? []);
      set({ items: normalized, loading: false });
      return normalized;
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
    const key = cacheKey(`/gists/user/${encodeURIComponent(avitag)}`, params as Record<string, unknown> | undefined);
    const data = await cachedRead<Gist[]>(key, () =>
      apiGet<Gist[]>(`/gists/user/${encodeURIComponent(avitag)}`, { params }),
    );
    return normalizeGists(data ?? []);
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
    // Offline — queue the mutation and return an optimistic gist so the UI
    // updates immediately. The real create will replay when connectivity
    // returns (see flushOfflineQueue).
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ type: "create-gist", payload });
      // Build an optimistic temporary gist for the UI. It gets replaced
      // once the real gist comes back from the server after flush.
      const optimistic: Gist = {
        gist_id: `offline-${crypto.randomUUID()}`,
        gist_text: String(payload.gist_text ?? ""),
        avitag: "",
        display_name: "",
        image_url: null,
        campus: null,
        major: null,
        level: undefined,
        media_urls: (payload.media_urls as string[]) ?? [],
        gif_url: (payload.gif_url as string) ?? null,
        gif_aspect_ratio: (payload.gif_aspect_ratio as number) ?? null,
        status: "POSTED",
        campus_tag: undefined,
        my_reaction: null,
        counts: { reactions_count: 0, comments_count: 0, views_count: 0, reports_count: 0, shares_count: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Prepend to the feed so the user sees it right away.
      set((s) => ({ items: [optimistic, ...s.items] }));
      return optimistic;
    }
    set({ loading: true, error: null });
    try {
      const res = await api.post<ApiEnvelope<Gist>>("/gists", payload);
      const gist = res.data?.data;
      if (gist) {
        set((s) => ({
          items: [normalizeGist(gist), ...s.items],
          loading: false,
        }));
        // Invalidate feed caches so the next list() fetches fresh data
        // that includes this new gist.
        cacheDeleteMatching(/^GET:\/gists/).catch(() => {});
      } else {
        set({ loading: false });
      }
      return gist;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to create gist"), loading: false });
      throw err;
    }
  },

  update: async (gistId, gistText) => {
    // Offline — queue the edit so it replays when connectivity returns.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ type: "update-gist", payload: { gist_id: gistId, gist_text: gistText } });
      // Apply optimistic text update to the local item immediately.
      set((s) => ({
        items: s.items.map((g) =>
          g.gist_id === gistId ? { ...g, gist_text: gistText } : g,
        ),
      }));
      return;
    }
    try {
      // PATCH, not PUT — the backend only registers this route as PATCH
      // (a partial update, which is what this actually is: gist_text
      // alone, not the whole resource). PUT silently 404s since Express
      // never matches it to the PATCH-only route, and the generic 404
      // handler's plain "Not Found" doesn't even hint at why.
      const res = await api.patch<ApiEnvelope<Gist>>(`/gists/${encodeURIComponent(gistId)}`, {
        gist_text: gistText,
      });
      cacheDeleteMatching(/^GET:\/gists/).catch(() => {});
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

  attachMediaUrl: async (gistId, url, width, height) => {
    try {
      const res = await api.post<ApiEnvelope<unknown>>(`/gists/${encodeURIComponent(gistId)}/media/url`, {
        media_url: url,
        width: width ?? undefined,
        height: height ?? undefined,
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
    // Offline — queue the deletion and remove from local items immediately.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ type: "delete-gist", payload: { gist_id: gistId } });
      set((s) => ({ items: s.items.filter((g) => g.gist_id !== gistId) }));
      return;
    }
    try {
      await api.delete(`/gists/${encodeURIComponent(gistId)}`);
      set((s) => ({ items: s.items.filter((g) => g.gist_id !== gistId) }));
      cacheDeleteMatching(/^GET:\/gists/).catch(() => {});
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
      cacheDeleteMatching(/^GET:\/gists/).catch(() => {});
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
      cacheDeleteMatching(/^GET:\/gists/).catch(() => {});
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

  /** Replays all queued offline gist mutations (create/update/delete) in
   * FIFO order and then invalidates the gist cache so the next feed read
   * picks up the new data. Call this from useNetworkStatus's onReconnect. */
  flushOfflineQueue: async () => {
    const { flush } = await import("@/lib/offlineQueue");
    await flush(async (action) => {
      switch (action.type) {
        case "create-gist":
          await api.post("/gists", action.payload);
          break;
        case "update-gist":
          await api.patch(
            `/gists/${encodeURIComponent(String(action.payload.gist_id))}`,
            { gist_text: action.payload.gist_text },
          );
          break;
        case "delete-gist":
          await api.delete(
            `/gists/${encodeURIComponent(String(action.payload.gist_id))}`,
          );
          break;
      }
    });
    // Strip optimistic (offline- prefixed) gists from the feed now that
    // the real ones have been POSTed to the server.  The next feed fetch
    // will bring back the canonical versions.
    set((s) => ({
      items: s.items.filter((g) => !g.gist_id.startsWith("offline-")),
    }));
  },

  /** Swaps in the fresh gists that the background refresh already cached —
   * no network call, instant. Called when the user taps the pill. */
  loadNewGists: () => {
    const key = get()._lastListKey;
    set({ hasNewGists: false });
    if (!key) return;
    cacheGet<Gist[]>(key)
      .then((fresh) => {
        if (fresh) set({ items: normalizeGists(fresh) });
      })
      .catch(() => {});
  },
}));
