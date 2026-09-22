import { create } from "zustand";
import axios from "axios";
import { api, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { uploadToCloudinaryDirect, type CloudinarySignature, type CloudinaryUploadResult } from "@/lib/cloudinary";

export type MediaUploadStage = "draft" | "signature" | "upload" | "finalize";
export class SpotUploadError extends Error {
  stage: MediaUploadStage;
  constructor(stage: MediaUploadStage, message: string) {
    super(message);
    this.stage = stage;
  }
}

/** What the backend's spot rows actually look like — see
 * KamposBackend/src/modules/spot/spot.repo.ts's SpotWithCounts. */
export interface Spot {
  spot_id: string;
  avitag: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  status: "DRAFT" | "ACTIVE" | "REJECTED" | "REMOVED";
  created_at: string;
  campus_tag: string | null;
  major_tag: string | null;
  level: number | null;
  first_name: string | null;
  image_url: string | null;
  reactions_count: number;
  comments_count: number;
  views_count: number;
  shares_count: number;
  /** 'LIKE' or null — Spot only ever sends/shows 'LIKE', see backend's own
   * doc on why the column technically allows the full reaction enum. */
  my_reaction: string | null;
  /** Persisted — survives reload, drives the flag button's disabled state. */
  my_report: boolean;
  _feed_cursor?: string;
}

export interface SpotComment {
  comment_id: string;
  spot_id: string;
  avitag: string;
  text: string;
  commented_at: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

// node-postgres returns COUNT(*)::BIGINT as a string (BIGINT overflows JS
// number precision, so pg never silently coerces it) — every count field
// below needs an explicit Number() or it renders as "0" the moment it's
// used in arithmetic (e.g. `count + 1` on an optimistic bump becomes
// string concatenation: "3" + 1 === "31").
function normalizeSpot(raw: Spot): Spot {
  return {
    ...raw,
    reactions_count: Number(raw.reactions_count ?? 0),
    comments_count: Number(raw.comments_count ?? 0),
    views_count: Number(raw.views_count ?? 0),
    shares_count: Number(raw.shares_count ?? 0),
  };
}

// Guards fetchFeed() against a slow, stale response clobbering newer local
// state — confirmed live: the initial feed fetch can take ~2s on a cold
// dev-server route compile, which is easily slower than opening the
// compose sheet, picking a file, and posting. Without this, that slow
// response's plain `set({ spots: data })` REPLACES the array wholesale
// once it finally resolves, silently erasing a spot postSpot()/
// prependSpot() had already added in the meantime. Bumped on every
// fetchFeed() call; a response only gets applied if it's still the most
// recently ISSUED request when it resolves — the same "ignore stale async
// responses" pattern any fetch-race bug needs, not specific to posting.
let feedFetchSeq = 0;

interface SpotState {
  spots: Spot[];
  loading: boolean;
  loadingMore: boolean;
  exhausted: boolean;
  error: string | null;
  commentsBySpot: Record<string, SpotComment[]>;
  commentsLoadingBySpot: Record<string, boolean>;

  fetchFeed: () => Promise<void>;
  loadMore: () => Promise<void>;
  toggleLike: (spotId: string) => Promise<void>;
  fetchComments: (spotId: string) => Promise<void>;
  addComment: (spotId: string, text: string) => Promise<void>;
  share: (spotId: string, platform?: string) => Promise<void>;
  report: (spotId: string, reason?: string) => Promise<void>;
  recordView: (spotId: string) => void;
  postSpot: (file: Blob, filename: string, caption: string, onProgress?: (percent: number) => void) => Promise<Spot>;
  prependSpot: (spot: Spot) => void;
}

export const useSpotStore = create<SpotState>((set, get) => ({
  spots: [],
  loading: false,
  loadingMore: false,
  exhausted: false,
  error: null,
  commentsBySpot: {},
  commentsLoadingBySpot: {},

  fetchFeed: async () => {
    const seq = ++feedFetchSeq;
    set({ loading: true, error: null });
    try {
      const res = await api.get<ApiEnvelope<Spot[]>>("/spots", { params: { limit: 10 } });
      if (seq !== feedFetchSeq) return; // a newer fetchFeed() call superseded this one — drop it
      const data = (res.data?.data ?? []).map(normalizeSpot);
      set({ spots: data, loading: false, exhausted: data.length === 0 });
    } catch (err) {
      if (seq !== feedFetchSeq) return;
      set({ loading: false, error: apiErrorMessage(err, "Couldn't load Spot") });
    }
  },

  loadMore: async () => {
    const { spots, loadingMore, exhausted } = get();
    if (loadingMore || exhausted) return;
    const cursor = spots[spots.length - 1]?._feed_cursor;
    if (!cursor) {
      set({ exhausted: true });
      return;
    }
    set({ loadingMore: true });
    try {
      const res = await api.get<ApiEnvelope<Spot[]>>("/spots", { params: { cursor, limit: 10 } });
      const data = (res.data?.data ?? []).map(normalizeSpot);
      set((s) => ({
        spots: [...s.spots, ...data],
        loadingMore: false,
        exhausted: data.length === 0,
      }));
    } catch {
      // A failed page-2+ fetch just leaves the sentinel in place to retry
      // on the next intersection — no need to surface a hard error for a
      // background pagination fetch the way the initial load does.
      set({ loadingMore: false });
    }
  },

  toggleLike: async (spotId) => {
    const spot = get().spots.find((s) => s.spot_id === spotId);
    if (!spot) return;
    const wasLiked = spot.my_reaction === "LIKE";
    // Optimistic — flips instantly, before the network call resolves, same
    // pattern gistStore's own react()/unreact() use.
    set((s) => ({
      spots: s.spots.map((sp) =>
        sp.spot_id === spotId
          ? {
              ...sp,
              my_reaction: wasLiked ? null : "LIKE",
              reactions_count: Math.max(0, sp.reactions_count + (wasLiked ? -1 : 1)),
            }
          : sp,
      ),
    }));
    try {
      if (wasLiked) {
        await api.delete(`/reactions/entity/SPOT/${encodeURIComponent(spotId)}`);
      } else {
        await api.post("/reactions", { entity_type: "SPOT", entity_id: spotId, type: "LIKE" });
      }
    } catch {
      // Revert on failure — the optimistic flip didn't actually happen.
      set((s) => ({
        spots: s.spots.map((sp) =>
          sp.spot_id === spotId
            ? { ...sp, my_reaction: wasLiked ? "LIKE" : null, reactions_count: spot.reactions_count }
            : sp,
        ),
      }));
    }
  },

  fetchComments: async (spotId) => {
    set((s) => ({ commentsLoadingBySpot: { ...s.commentsLoadingBySpot, [spotId]: true } }));
    try {
      const res = await api.get<ApiEnvelope<SpotComment[]>>(`/spot-comments/spot/${encodeURIComponent(spotId)}`);
      const data = res.data?.data ?? [];
      set((s) => ({
        commentsBySpot: { ...s.commentsBySpot, [spotId]: data },
        commentsLoadingBySpot: { ...s.commentsLoadingBySpot, [spotId]: false },
      }));
    } catch {
      set((s) => ({ commentsLoadingBySpot: { ...s.commentsLoadingBySpot, [spotId]: false } }));
    }
  },

  addComment: async (spotId, text) => {
    // Bumps the visible count optimistically (same reasoning as every other
    // Spot action here) — the real comment gets prepended once the request
    // resolves, not before, since it needs the server's own profile join
    // (first_name/image_url) to render correctly.
    set((s) => ({
      spots: s.spots.map((sp) => (sp.spot_id === spotId ? { ...sp, comments_count: sp.comments_count + 1 } : sp)),
    }));
    try {
      const res = await api.post<ApiEnvelope<SpotComment>>("/spot-comments", { spot_id: spotId, text });
      const created = res.data?.data;
      if (created) {
        set((s) => ({
          commentsBySpot: { ...s.commentsBySpot, [spotId]: [created, ...(s.commentsBySpot[spotId] ?? [])] },
        }));
      }
    } catch (err) {
      set((s) => ({
        spots: s.spots.map((sp) => (sp.spot_id === spotId ? { ...sp, comments_count: Math.max(0, sp.comments_count - 1) } : sp)),
      }));
      throw new Error(apiErrorMessage(err, "Couldn't post your comment"));
    }
  },

  share: async (spotId, platform) => {
    set((s) => ({
      spots: s.spots.map((sp) => (sp.spot_id === spotId ? { ...sp, shares_count: sp.shares_count + 1 } : sp)),
    }));
    try {
      await api.post(`/spots/${encodeURIComponent(spotId)}/share`, platform ? { platform } : {});
    } catch {
      /* a failed share-log doesn't need to roll back the optimistic count or surface an error — the share itself already happened on the user's device */
    }
  },

  report: async (spotId, reason) => {
    set((s) => ({
      spots: s.spots.map((sp) => (sp.spot_id === spotId ? { ...sp, my_report: true } : sp)),
    }));
    try {
      await api.post(`/spots/${encodeURIComponent(spotId)}/report`, reason ? { reason } : {});
    } catch (err) {
      set((s) => ({
        spots: s.spots.map((sp) => (sp.spot_id === spotId ? { ...sp, my_report: false } : sp)),
      }));
      throw new Error(apiErrorMessage(err, "Couldn't report this — please try again"));
    }
  },

  // Fire-and-forget, no optimistic UI to manage — a view has nothing
  // visible on screen to reflect (see spot.repo.ts's own doc: "fetched" and
  // "actually played" are deliberately different events).
  recordView: (spotId) => {
    void api.post(`/spots/${encodeURIComponent(spotId)}/view`).catch(() => {});
  },

  prependSpot: (spot) => {
    // Invalidates any still-in-flight fetchFeed() started before this —
    // once the user has posted something new, a slow GET snapshot from
    // before that post exists is stale and must not overwrite this.
    feedFetchSeq++;
    set((s) => ({ spots: [normalizeSpot(spot), ...s.spots] }));
  },

  postSpot: async (file, filename, caption, onProgress) => {
    let spotId: string;
    try {
      const res = await api.post<ApiEnvelope<{ spot_id: string }>>("/spots/draft");
      const id = res.data?.data?.spot_id;
      if (!id) throw new Error("No spot_id returned");
      spotId = id;
    } catch (err) {
      throw new SpotUploadError("draft", apiErrorMessage(err, "Couldn't start posting"));
    }

    let sig: CloudinarySignature;
    try {
      const res = await api.get<ApiEnvelope<CloudinarySignature>>(`/spots/${encodeURIComponent(spotId)}/media/signature`);
      if (!res.data?.data) throw new Error("No signature returned");
      sig = res.data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        throw new SpotUploadError("signature", "Too many uploads at once — wait a few seconds and try again.");
      }
      throw new SpotUploadError("signature", apiErrorMessage(err, "Couldn't start the upload"));
    }

    let result: CloudinaryUploadResult;
    try {
      result = await uploadToCloudinaryDirect(file, filename, sig, onProgress);
    } catch (err) {
      throw new SpotUploadError("upload", err instanceof Error ? err.message : "Upload failed");
    }

    try {
      const res = await api.post<ApiEnvelope<Spot>>(`/spots/${encodeURIComponent(spotId)}/finalize`, {
        media_url: result.secure_url,
        public_id: result.public_id,
        resource_type: result.resource_type,
        bytes: result.bytes,
        duration: result.duration,
        width: result.width,
        height: result.height,
        caption: caption.trim() || undefined,
      });
      const finalized = res.data?.data;
      if (!finalized) throw new Error("No spot returned");
      return normalizeSpot(finalized);
    } catch (err) {
      throw new SpotUploadError("finalize", apiErrorMessage(err, "Couldn't save the upload"));
    }
  },
}));
