import { create } from "zustand";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { wsClient } from "@/lib/ws";
import { enqueue, getQueuedActions } from "@/lib/offlineQueue";
import { useAuthStore } from "@/stores/authStore";
import type { Comment, ReactionType } from "@/types";

const COMMENTS_PAGE_SIZE = 20; // matches the backend's own default page size

/** Builds the same optimistic placeholder shape whether it's coming from
 *  create()'s own offline branch (a comment you're posting right now) or
 *  the pending-comment overlay below (rebuilding one after a reload found
 *  it still sitting in the offline queue) — same fields, same look. `idKey`
 *  is whatever makes this call's id stable: create() uses a fresh
 *  crypto.randomUUID() since it's a genuinely new comment; the overlay
 *  uses the queued action's own id so re-running the overlay (e.g. a pull-
 *  to-refresh while still offline) produces the exact same comment_id
 *  instead of a new one each time. */
function buildOfflineComment(gistId: string, text: string, idKey: string, createdAtMs: number): Comment {
  const { avitag: myAvitag, profiles } = useAuthStore.getState();
  const myProfile = profiles.find((p) => p.avitag === myAvitag);
  return {
    comment_id: `offline-${idKey}`,
    gist_id: gistId,
    text,
    avitag: myAvitag ?? undefined,
    // The moment it was actually queued, not "now" — see gistStore's
    // buildOfflineGist for the identical reasoning. Without this, a
    // comment reconstructed after a reload well after the fact would show
    // as posted "just now" instead of however long ago it really was.
    commented_at: new Date(createdAtMs).toISOString(),
    reactions_count: 0,
    my_reaction: null,
    first_name: (myProfile?.first_name as string | undefined) ?? null,
    last_name: (myProfile?.last_name as string | undefined) ?? null,
    campus_tag: (myProfile?.campus_tag as string | undefined) ?? null,
    major_tag: (myProfile?.major_tag as string | undefined) ?? null,
    level: (myProfile?.level as number | undefined) ?? null,
    image_url: (myProfile?.image_url as string | undefined) ?? null,
  };
}

/** Mirrors gistStore's applyPendingReactionOverlay — a comment posted while
 *  offline lives only in the queue (durable) and, until now, component
 *  state (gone on reload). Groups every still-queued create-comment action
 *  by gist_id, newest first per gist to match the real feed's own newest-
 *  first order, so callers can prepend them onto whatever real comments
 *  they already have. */
async function getPendingCommentsByGist(): Promise<Map<string, Comment[]>> {
  const map = new Map<string, Comment[]>();
  try {
    const queued = await getQueuedActions();
    for (const action of queued) {
      if (action.type !== "create-comment") continue;
      const gistId = action.payload.gist_id;
      const text = action.payload.text;
      if (typeof gistId !== "string" || typeof text !== "string") continue;
      const comment = buildOfflineComment(gistId, text, action.id, action.ts);
      // Queue is oldest-first; unshift so the final per-gist array ends up
      // newest-first, same convention the real /comments/gist endpoint uses.
      const list = map.get(gistId);
      if (list) list.unshift(comment);
      else map.set(gistId, [comment]);
    }
  } catch {
    // IndexedDB unavailable — skip the overlay rather than fail the fetch.
  }
  return map;
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
  /** True for a gist whose most recent comment fetch actually failed
   * (network/backend error) — distinct from simply not-yet-cached (still
   * loading) or genuinely cached-as-empty (no comments exist). The panel
   * needs to tell these apart: showing "nobody don talk yet" for a gist
   * that just failed to load misrepresents a real error as an empty
   * thread. Cleared the moment a fetch for that gist succeeds. */
  errorByGist: Record<string, boolean>;
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
  /** Toggle-off — clears the viewer's own reaction on a comment. */
  unreactComment: (commentId: string, gistId: string) => Promise<void>;
}

export const useCommentStore = create<CommentState>((set, get) => ({
  itemsByGist: {},
  loadingByGist: {},
  loadingMoreByGist: {},
  hasMoreByGist: {},
  recentlyLiveIds: {},
  errorByGist: {},
  error: null,

  listByGist: async (gistId, params = {}, opts = {}) => {
    const cached = get().itemsByGist[gistId];
    if (cached && !opts.force) return cached;

    set((s) => ({
      loadingByGist: { ...s.loadingByGist, [gistId]: true },
      errorByGist: { ...s.errorByGist, [gistId]: false },
      error: null,
    }));
    try {
      const data =
        (await apiGet<Comment[]>(`/comments/gist/${encodeURIComponent(gistId)}`, { params })) ?? [];
      // Rebuild any comment still sitting in the offline queue for this
      // gist — real data always wins underneath it, this just puts the
      // still-pending one back on top of it, same as it looked before a
      // reload wiped the in-memory copy.
      const pending = (await getPendingCommentsByGist()).get(gistId) ?? [];
      const withPending = pending.length ? [...pending, ...data] : data;
      set((s) => ({
        itemsByGist: { ...s.itemsByGist, [gistId]: withPending },
        loadingByGist: { ...s.loadingByGist, [gistId]: false },
        hasMoreByGist: { ...s.hasMoreByGist, [gistId]: data.length >= COMMENTS_PAGE_SIZE },
      }));
      return withPending;
    } catch (err) {
      // Leave itemsByGist untouched on failure (not "cached" as empty) —
      // errorByGist is what actually tells the panel this was a real
      // failure, not a still-loading or genuinely-empty thread, so it can
      // show a distinct "failed to load, retry" state instead of either.
      set((s) => ({
        loadingByGist: { ...s.loadingByGist, [gistId]: false },
        errorByGist: { ...s.errorByGist, [gistId]: true },
        error: apiErrorMessage(err, "Failed to load comments"),
      }));
      return [];
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
        // Same overlay as listByGist — a prefetched gist populates
        // itemsByGist too, so without this, opening a comment panel for a
        // gist that was only ever prefetched (not individually fetched via
        // listByGist) would skip the pending-comment overlay entirely,
        // since listByGist's own cache check returns early once this has
        // already filled the slot.
        const pendingByGist = await getPendingCommentsByGist();
        const withPending: Record<string, Comment[]> = {};
        for (const [id, comments] of Object.entries(res)) {
          const pending = pendingByGist.get(id);
          withPending[id] = pending?.length ? [...pending, ...comments] : comments;
        }
        set((s) => {
          const hasMoreByGist = { ...s.hasMoreByGist };
          for (const [id, comments] of Object.entries(res)) {
            hasMoreByGist[id] = comments.length >= limit;
          }
          return { itemsByGist: { ...s.itemsByGist, ...withPending }, hasMoreByGist };
        });
      }
    } catch {
      // Best-effort — if the batch endpoint is unreachable, each gist's own
      // listByGist call still covers it whenever that gist actually gets visited.
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
    // Offline — queue it and show an optimistic comment immediately, same
    // pattern as gistStore.create(). No error, no "still saving" caveat
    // needed here the way an offline gist gets one: unlike a gist (which
    // needs its own real gist_id to be shareable/reactable before it's
    // synced), a comment has nothing else waiting on it, so it can just
    // look sent.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const queued = await enqueue({ type: "create-comment", payload: { gist_id: payload.gist_id, text: payload.text } });
      const optimistic = buildOfflineComment(payload.gist_id, payload.text, queued.id, queued.ts);
      set((s) => ({
        itemsByGist: {
          ...s.itemsByGist,
          [payload.gist_id]: [optimistic, ...(s.itemsByGist[payload.gist_id] ?? [])],
        },
      }));
      return optimistic;
    }
    // Online, but optimistic too now — same placeholder shape/helper the
    // offline branch above already uses (same "offline-" id prefix, so the
    // existing "can't react to a not-yet-synced comment" guards elsewhere
    // just work), inserted before the request rather than after it. A
    // comment has nothing else waiting on it (see the offline branch's own
    // reasoning above), so there's nothing lost by showing it immediately
    // and quietly reconciling once the real one comes back.
    const tempId = crypto.randomUUID();
    const optimistic = buildOfflineComment(payload.gist_id, payload.text, tempId, Date.now());
    set((s) => ({
      itemsByGist: {
        ...s.itemsByGist,
        [payload.gist_id]: [optimistic, ...(s.itemsByGist[payload.gist_id] ?? [])],
      },
    }));
    try {
      const res = await api.post<ApiEnvelope<Comment>>("/comments", payload);
      const created = res.data?.data;
      if (created) {
        // The backend fires the `comment:created` WS broadcast BEFORE it
        // even sends this REST response back (see comment.controller.ts) —
        // a plain WS push reaching the browser is typically faster than a
        // full HTTP response round trip, so the module-level subscriber
        // below can easily insert this exact comment (by its REAL id)
        // before this ever resolves. This reconciliation has to handle
        // both: drop OUR OWN optimistic placeholder wherever it now sits
        // in the list (not necessarily still at index 0, if anything else
        // arrived in the meantime), and skip re-inserting the real comment
        // if the WS push already beat us to it.
        set((s) => {
          const withoutPlaceholder = (s.itemsByGist[payload.gist_id] ?? []).filter(
            (c) => c.comment_id !== optimistic.comment_id,
          );
          const alreadyPresent = withoutPlaceholder.some((c) => c.comment_id === created.comment_id);
          return {
            itemsByGist: {
              ...s.itemsByGist,
              [payload.gist_id]: alreadyPresent ? withoutPlaceholder : [created, ...withoutPlaceholder],
            },
          };
        });
      }
      return created;
    } catch (err) {
      // Roll back — drop the placeholder, same "undo exactly this call's
      // own change" reasoning every other optimistic action in this app
      // already follows.
      set((s) => ({
        itemsByGist: {
          ...s.itemsByGist,
          [payload.gist_id]: (s.itemsByGist[payload.gist_id] ?? []).filter(
            (c) => c.comment_id !== optimistic.comment_id,
          ),
        },
        error: apiErrorMessage(err, "Failed to create comment"),
      }));
      throw err;
    }
  },

  remove: async (commentId, gistId) => {
    // Optimistic — itemsByGist is what CommentList actually renders from,
    // so removing it here is enough on its own. Captured before removing
    // so a failure can restore it at its exact original position.
    let removed: { item: Comment; index: number } | undefined;
    set((s) => {
      const list = s.itemsByGist[gistId] ?? [];
      const idx = list.findIndex((c) => c.comment_id === commentId);
      if (idx !== -1) removed = { item: list[idx], index: idx };
      return {
        itemsByGist: { ...s.itemsByGist, [gistId]: list.filter((c) => c.comment_id !== commentId) },
      };
    });
    try {
      await api.delete(`/comments/${encodeURIComponent(commentId)}`);
    } catch (err) {
      if (removed) {
        const restore = removed;
        set((s) => {
          const list = s.itemsByGist[gistId] ?? [];
          return {
            itemsByGist: {
              ...s.itemsByGist,
              [gistId]: [...list.slice(0, restore.index), restore.item, ...list.slice(restore.index)],
            },
          };
        });
      }
      set({ error: apiErrorMessage(err, "Failed to delete comment") });
      throw err;
    }
  },

  reactComment: async (commentId, gistId, type) => {
    let previous: Comment | undefined;
    set((s) => ({
      itemsByGist: {
        ...s.itemsByGist,
        [gistId]: (s.itemsByGist[gistId] ?? []).map((c) => {
          if (c.comment_id !== commentId) return c;
          previous = c;
          return {
            ...c,
            // Total count only grows the first time you react — picking
            // a different type later (there's only ever LOVE right now,
            // but this stays correct if that changes) would still just be
            // one reaction. unreactComment below is the actual toggle-off.
            reactions_count: (c.reactions_count ?? 0) + (c.my_reaction ? 0 : 1),
            my_reaction: type,
          };
        }),
      },
    }));

    try {
      await api.post("/reactions", { entity_type: "COMMENT", entity_id: commentId, type });
    } catch (err) {
      if (previous) {
        set((s) => ({
          itemsByGist: {
            ...s.itemsByGist,
            [gistId]: (s.itemsByGist[gistId] ?? []).map((c) => (c.comment_id === commentId ? previous! : c)),
          },
        }));
      }
      set({ error: apiErrorMessage(err, "Failed to react") });
      throw err;
    }
  },

  unreactComment: async (commentId, gistId) => {
    let previous: Comment | undefined;
    set((s) => ({
      itemsByGist: {
        ...s.itemsByGist,
        [gistId]: (s.itemsByGist[gistId] ?? []).map((c) => {
          if (c.comment_id !== commentId) return c;
          previous = c;
          return {
            ...c,
            reactions_count: Math.max(0, (c.reactions_count ?? 0) - (c.my_reaction ? 1 : 0)),
            my_reaction: null,
          };
        }),
      },
    }));

    try {
      await api.delete(`/reactions/entity/COMMENT/${encodeURIComponent(commentId)}`);
    } catch (err) {
      if (previous) {
        set((s) => ({
          itemsByGist: {
            ...s.itemsByGist,
            [gistId]: (s.itemsByGist[gistId] ?? []).map((c) => (c.comment_id === commentId ? previous! : c)),
          },
        }));
      }
      set({ error: apiErrorMessage(err, "Failed to remove reaction") });
      throw err;
    }
  },
}));

// One shared subscription for the whole app: a comment created by anyone
// else, on a gist you already have open/cached, slides straight into the
// list instead of waiting for you to leave and come back. Module-level (not
// component-level) so it keeps working regardless of which panel is mounted.
//
// Dev-mode Fast Refresh re-runs this module every time this file is
// edited — wsClient is a separate, stable singleton, so without this
// guard each reload would leave one more stale listener attached to it
// permanently (same issue fixed in gistStore.ts's own WS subscriptions —
// see its comment for the full reasoning). Storing the unsubscribe on
// globalThis, which survives a module reload unlike a plain module-level
// variable, means each reload tears down its predecessor first.
const commentWsHandles = globalThis as unknown as { __kamposCommentCreatedUnsub?: () => void };
commentWsHandles.__kamposCommentCreatedUnsub?.();

if (typeof window !== "undefined") {
  commentWsHandles.__kamposCommentCreatedUnsub = wsClient.subscribe("comment:created", (payload) => {
    const comment = (payload as { comment?: Comment } | undefined)?.comment;
    if (!comment?.gist_id || !comment?.comment_id) return;

    const state = useCommentStore.getState();
    const existing = state.itemsByGist[comment.gist_id];
    // Not cached at all — whoever visits this gist next will fetch fresh
    // and get it naturally, nothing to do here.
    if (!existing) return;
    // Dedup against a comment already fully reconciled (either an earlier
    // delivery of this same broadcast, or create()'s own await already won
    // the race and finished reconciling first).
    if (existing.some((c) => c.comment_id === comment.comment_id)) return;

    // This broadcast fires before the REST response even comes back (see
    // create()'s own comment on this), so it can easily arrive WHILE our
    // own optimistic placeholder (a different, temporary "offline-" id —
    // see buildOfflineComment) is still sitting in the list. If this is
    // that same comment coming back around — same author, still exactly
    // one of our own not-yet-reconciled placeholders present — swap the
    // placeholder for the real thing instead of appending both, which
    // would otherwise flash a visible duplicate for the brief window
    // until create()'s own reconciliation runs.
    const myAvitag = useAuthStore.getState().avitag;
    const ownPlaceholder =
      comment.avitag && comment.avitag === myAvitag
        ? existing.find((c) => c.comment_id.startsWith("offline-"))
        : undefined;
    const withoutPlaceholder = ownPlaceholder
      ? existing.filter((c) => c.comment_id !== ownPlaceholder.comment_id)
      : existing;

    useCommentStore.setState((s) => ({
      itemsByGist: { ...s.itemsByGist, [comment.gist_id]: [comment, ...withoutPlaceholder] },
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
