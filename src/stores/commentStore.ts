import { create } from "zustand";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { wsClient } from "@/lib/ws";
import type { Comment, ReactionType } from "@/types";

const DEMO_COMMENT_COUNT = 20;
const COMMENTS_PAGE_SIZE = 20; // matches the backend's own default page size

function sampleCommentsFor(gistId: string): Comment[] {
  return Array.from({ length: DEMO_COMMENT_COUNT }).map((_, i) => ({
    comment_id: `demo-comment-${gistId}-${i}`,
    gist_id: gistId,
    avitag: `kampos_user_${i + 1}`,
    text:
      i % 3 === 0
        ? `This is sample comment number ${i + 1}, and this one is deliberately long so we can test the "...more" truncation on the comment panel — it should collapse after roughly 280 characters and show a toggle to expand it back out. Padding this out a bit further with a bit more rambling text just to make sure it comfortably clears that threshold and wraps across several lines inside the bubble before it gets cut off.`
        : `This is sample comment number ${i + 1}. We are adding some extra text to see how it wraps and to make sure the scrollable comment panel works perfectly with a lot of comments!`,
    commented_at: new Date(Date.now() - i * 60000 * 15).toISOString(),
  }));
}

interface CommentState {
  /** Keyed by gist_id — comments are never thrown away on switching gists,
   * only ever added to, so revisiting a gist you've already viewed this
   * session is instant (no refetch, no skeleton). */
  itemsByGist: Record<string, Comment[]>;
  loadingByGist: Record<string, boolean>;
  loadingMoreByGist: Record<string, boolean>;
  /** False once a gist's most recent page came back short of a full page —
   * i.e. there's genuinely nothing further to fetch. Undefined (not yet
   * known) is treated as "maybe more" until proven otherwise. */
  hasMoreByGist: Record<string, boolean>;
  /** comment_ids that just arrived live over WS (not from your own post) —
   * cleared automatically a couple seconds after arrival. Lets the UI give
   * a brief "this just showed up" highlight distinct from the normal
   * entrance animation every new item gets regardless of source. */
  recentlyLiveIds: Record<string, boolean>;
  error: string | null;
  /** `force` bypasses the cache — used for an explicit refresh, not the
   * normal "switch to this gist" path, which should prefer cached data. */
  listByGist: (
    gistId: string,
    params?: Record<string, unknown>,
    opts?: { force?: boolean },
  ) => Promise<Comment[]>;
  /** One request for the first page of comments across many gists at once —
   * fills the same cache listByGist reads from, so gists prefetched this way
   * need no further fetch when actually visited. */
  prefetchBatch: (gistIds: string[], limit?: number) => Promise<void>;
  /** Fetches the next page beyond whatever's already cached for this gist
   * (cursor = the oldest comment currently loaded) and appends it — for
   * scrolling further down an already-open thread past its first page. */
  loadMoreByGist: (gistId: string) => Promise<void>;
  create: (payload: { gist_id: string; text: string }) => Promise<Comment | undefined>;
  remove: (commentId: string, gistId: string) => Promise<void>;
  /** Toggle-free — matches gist reactions: picking a type sets/replaces your
   * reaction, it never un-reacts. Optimistic (updates local state before the
   * request resolves) since this is meant to feel instant on tap. */
  reactComment: (commentId: string, gistId: string, type: ReactionType) => Promise<void>;
}

export const useCommentStore = create<CommentState>((set, get) => ({
  itemsByGist: {},
  loadingByGist: {},
  loadingMoreByGist: {},
  hasMoreByGist: {},
  recentlyLiveIds: {},
  error: null,

  listByGist: async (gistId, params = {}, opts = {}) => {
    const cached = get().itemsByGist[gistId];
    if (cached && !opts.force) return cached;

    set((s) => ({ loadingByGist: { ...s.loadingByGist, [gistId]: true }, error: null }));
    try {
      const data =
        (await apiGet<Comment[]>(`/comments/gist/${encodeURIComponent(gistId)}`, { params })) ?? [];
      set((s) => ({
        itemsByGist: { ...s.itemsByGist, [gistId]: data },
        loadingByGist: { ...s.loadingByGist, [gistId]: false },
        hasMoreByGist: { ...s.hasMoreByGist, [gistId]: data.length >= COMMENTS_PAGE_SIZE },
      }));
      return data;
    } catch (err) {
      // Backend unreachable → fallback to sample comments so the UI is testable.
      // Synthetic data has no real "next page" to paginate through.
      const sampleComments = sampleCommentsFor(gistId);
      set((s) => ({
        itemsByGist: { ...s.itemsByGist, [gistId]: sampleComments },
        loadingByGist: { ...s.loadingByGist, [gistId]: false },
        hasMoreByGist: { ...s.hasMoreByGist, [gistId]: false },
      }));
      return sampleComments;
    }
  },

  prefetchBatch: async (gistIds, limit = COMMENTS_PAGE_SIZE) => {
    // Only ask for gists that aren't already cached — a prefetch shouldn't
    // stomp on comments already loaded (e.g. from an earlier visit, or a
    // previous overlapping prefetch).
    const uncached = gistIds.filter((id) => !get().itemsByGist[id]);
    if (uncached.length === 0) return;
    try {
      const res = await apiGet<Record<string, Comment[]>>("/comments/batch", {
        params: { gist_ids: uncached.join(","), limit },
      });
      if (res) {
        set((s) => {
          const hasMoreByGist = { ...s.hasMoreByGist };
          for (const [id, comments] of Object.entries(res)) {
            hasMoreByGist[id] = comments.length >= limit;
          }
          return { itemsByGist: { ...s.itemsByGist, ...res }, hasMoreByGist };
        });
      }
    } catch {
      // Best-effort — if the batch endpoint is unreachable, individual
      // per-gist fetches (with their own demo-data fallback) still cover it
      // whenever each gist actually gets visited.
    }
  },

  loadMoreByGist: async (gistId) => {
    const state = get();
    if (state.loadingMoreByGist[gistId] || state.hasMoreByGist[gistId] === false) return;
    const current = state.itemsByGist[gistId] ?? [];
    const oldest = current[current.length - 1];
    if (!oldest) return; // nothing loaded yet — that's listByGist's job, not this one

    set((s) => ({ loadingMoreByGist: { ...s.loadingMoreByGist, [gistId]: true } }));
    try {
      const data =
        (await apiGet<Comment[]>(`/comments/gist/${encodeURIComponent(gistId)}`, {
          params: { cursor: oldest.comment_id, limit: COMMENTS_PAGE_SIZE },
        })) ?? [];
      set((s) => ({
        itemsByGist: { ...s.itemsByGist, [gistId]: [...(s.itemsByGist[gistId] ?? []), ...data] },
        hasMoreByGist: { ...s.hasMoreByGist, [gistId]: data.length >= COMMENTS_PAGE_SIZE },
        loadingMoreByGist: { ...s.loadingMoreByGist, [gistId]: false },
      }));
    } catch {
      // Demo gist (fake id against a real backend) or genuinely unreachable
      // — either way there's nothing further to paginate through here.
      set((s) => ({
        hasMoreByGist: { ...s.hasMoreByGist, [gistId]: false },
        loadingMoreByGist: { ...s.loadingMoreByGist, [gistId]: false },
      }));
    }
  },

  create: async (payload) => {
    try {
      const res = await api.post<ApiEnvelope<Comment>>("/comments", payload);
      const created = res.data?.data;
      if (created) {
        set((s) => ({
          itemsByGist: {
            ...s.itemsByGist,
            [payload.gist_id]: [created, ...(s.itemsByGist[payload.gist_id] ?? [])],
          },
        }));
      }
      return created;
    } catch (err) {
      // Sample gists (fed in when the real feed comes back empty — see
      // SAMPLE_GISTS in feed/page.tsx) don't exist on the backend, so a real
      // POST always 404s here. Rather than hard-fail the whole composer for
      // demo data, add the comment locally so the UI still works end to end.
      if (payload.gist_id.startsWith("demo-")) {
        const optimistic: Comment = {
          comment_id: `local-${Date.now()}`,
          gist_id: payload.gist_id,
          avitag: "you",
          text: payload.text,
          commented_at: new Date().toISOString(),
        };
        set((s) => ({
          itemsByGist: {
            ...s.itemsByGist,
            [payload.gist_id]: [optimistic, ...(s.itemsByGist[payload.gist_id] ?? [])],
          },
        }));
        return optimistic;
      }
      set({ error: apiErrorMessage(err, "Failed to create comment") });
      throw err;
    }
  },

  remove: async (commentId, gistId) => {
    try {
      await api.delete(`/comments/${encodeURIComponent(commentId)}`);
      set((s) => ({
        itemsByGist: {
          ...s.itemsByGist,
          [gistId]: (s.itemsByGist[gistId] ?? []).filter((c) => c.comment_id !== commentId),
        },
      }));
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete comment") });
      throw err;
    }
  },

  reactComment: async (commentId, gistId, type) => {
    const applyLocal = () =>
      set((s) => ({
        itemsByGist: {
          ...s.itemsByGist,
          [gistId]: (s.itemsByGist[gistId] ?? []).map((c) =>
            c.comment_id === commentId
              ? {
                  ...c,
                  // Total count only grows the first time you react — picking
                  // a different type later would still just be one reaction.
                  // (There's no "un-react" path here, matching gist reactions.)
                  reactions_count: (c.reactions_count ?? 0) + (c.my_reaction ? 0 : 1),
                  my_reaction: type,
                }
              : c,
          ),
        },
      }));

    applyLocal();
    try {
      await api.post("/reactions", { entity_type: "COMMENT", entity_id: commentId, type });
    } catch {
      // Best-effort — demo comments (fake ids) will always fail this against
      // a real backend; the optimistic UI stands either way, matching how
      // gist reactions already behave.
    }
  },
}));

// One shared subscription for the whole app: a comment created by anyone
// else, on a gist you already have open/cached, slides straight into the
// list instead of waiting for you to leave and come back. Module-level (not
// component-level) so it keeps working regardless of which panel is mounted.
if (typeof window !== "undefined") {
  wsClient.subscribe("comment:created", (payload) => {
    const comment = (payload as { comment?: Comment } | undefined)?.comment;
    if (!comment?.gist_id || !comment?.comment_id) return;

    const state = useCommentStore.getState();
    const existing = state.itemsByGist[comment.gist_id];
    // Not cached at all — whoever visits this gist next will fetch fresh
    // and get it naturally, nothing to do here.
    if (!existing) return;
    // Dedup: our own post already lands in the cache via `create`'s own
    // optimistic update before this broadcast (which includes our own
    // comments too) ever arrives.
    if (existing.some((c) => c.comment_id === comment.comment_id)) return;

    useCommentStore.setState((s) => ({
      itemsByGist: { ...s.itemsByGist, [comment.gist_id]: [comment, ...existing] },
      recentlyLiveIds: { ...s.recentlyLiveIds, [comment.comment_id]: true },
    }));
    setTimeout(() => {
      useCommentStore.setState((s) => {
        if (!s.recentlyLiveIds[comment.comment_id]) return s;
        const next = { ...s.recentlyLiveIds };
        delete next[comment.comment_id];
        return { recentlyLiveIds: next };
      });
    }, 2500);
  });
}
