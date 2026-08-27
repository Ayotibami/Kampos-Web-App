import { create } from "zustand";
import axios from "axios";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { uploadToCloudinaryDirect, type CloudinarySignature, type CloudinaryUploadResult } from "@/lib/cloudinary";
import { cacheGet, cacheSet, cacheDeleteMatching } from "@/lib/dataCache";
import { enqueue, getQueuedActions } from "@/lib/offlineQueue";
import { wsClient } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import type { Gist, GistCounts, GistMedia, ReactionType } from "@/types";

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

/**
 * A reaction made while offline lives only in two places: the offline
 * queue (durable, in IndexedDB) and, for as long as the tab stays open,
 * component-local optimistic state in GistCard/MobileReactionBadge/
 * ReactionButton. Reload the page before reconnecting and that second part
 * is gone — the queued action is still safe and will still send once
 * you're back online, but the screen would go back to showing you as not
 * having reacted at all until it does. This rebuilds that missing half:
 * every gist fetch (list/byUser/get/getContext) runs its results through
 * this first, so a still-pending reaction shows correctly from the very
 * first paint after a reload, not just from the moment you originally
 * tapped it.
 *
 * Reads the queue fresh on every call rather than caching it — these calls
 * are infrequent (once per page load / pagination step, not per render)
 * and the queue can change size at any moment as flush() drains it in the
 * background, so a cached snapshot would just as easily go stale as be
 * correct.
 */
async function getPendingReactionsByGist(): Promise<Map<string, ReactionType | null>> {
  const map = new Map<string, ReactionType | null>();
  try {
    const queued = await getQueuedActions();
    for (const action of queued) {
      const gistId = action.payload.gist_id;
      if (typeof gistId !== "string") continue;
      if (action.type === "react-gist") {
        map.set(gistId, action.payload.type as ReactionType);
      } else if (action.type === "unreact-gist") {
        map.set(gistId, null);
      }
    }
  } catch {
    // IndexedDB unavailable (private browsing, etc.) — just skip the
    // overlay rather than fail the whole gist fetch over it.
  }
  return map;
}

/** Patches `my_reaction`/`counts` on each gist with whatever's still
 *  pending in the offline queue — see getPendingReactionsByGist above for
 *  why. A no-op (same array back) when nothing's queued, which is the
 *  overwhelming common case, so this is cheap to call unconditionally. */
async function applyPendingReactionOverlay(gists: Gist[]): Promise<Gist[]> {
  const pending = await getPendingReactionsByGist();
  if (pending.size === 0) return gists;
  return gists.map((g) => {
    if (!pending.has(g.gist_id)) return g;
    const newReaction = pending.get(g.gist_id) ?? null;
    const hadReaction = !!g.my_reaction;
    const hasReaction = newReaction !== null;
    // Same "total only grows the first time you react" rule react()/
    // unreact() already apply optimistically — switching type while
    // already reacted doesn't touch the total, matching the backend.
    let totalDelta = 0;
    if (!hadReaction && hasReaction) totalDelta = 1;
    else if (hadReaction && !hasReaction) totalDelta = -1;

    const byType = { ...(g.counts?.reactions_by_type ?? {}) };
    if (g.my_reaction && g.my_reaction !== newReaction) {
      byType[g.my_reaction] = Math.max(0, (byType[g.my_reaction] ?? 0) - 1);
    }
    if (newReaction && g.my_reaction !== newReaction) {
      byType[newReaction] = (byType[newReaction] ?? 0) + 1;
    }

    return {
      ...g,
      my_reaction: newReaction,
      counts: {
        ...(g.counts ?? { reactions_count: 0, comments_count: 0, views_count: 0, reports_count: 0 }),
        reactions_count: Math.max(0, (g.counts?.reactions_count ?? 0) + totalDelta),
        reactions_by_type: byType,
      },
    };
  });
}

/** Builds the same optimistic placeholder shape whether it's coming from
 *  create()'s own offline branch (a gist you're posting right now) or the
 *  pending-gist overlay below (rebuilding one after a reload found it
 *  still sitting in the offline queue) — same fields, same look. `idKey`
 *  is whatever makes this call's id stable: create() uses a fresh
 *  crypto.randomUUID() since it's a genuinely new post; the overlay uses
 *  the queued action's own id so re-running it (e.g. a pull-to-refresh
 *  while still offline) produces the exact same gist_id instead of a new
 *  one each time — matching commentStore's buildOfflineComment, same
 *  reasoning. */
/** Shape of one picked-but-not-yet-uploaded media item as CreateGistSheet
 *  hands it to the offline queue — deliberately not the real GistMedia
 *  shape (no media_id/gist_id yet, nothing's been uploaded). `blob` is the
 *  raw file data for a camera/gallery pick; `remoteUrl` is set instead for
 *  a GIPHY pick (already hosted on GIPHY's CDN — nothing to upload, just a
 *  URL to attach once back online). IndexedDB's structured-clone storage
 *  handles a real Blob natively, same as any other value — no special
 *  encoding needed to persist one in the queue. */
interface QueuedMediaItem {
  kind: "image" | "video";
  name: string;
  blob?: Blob;
  remoteUrl?: string;
  width?: number | null;
  height?: number | null;
}

/** Builds the optimistic media array for an offline-created/edited gist —
 *  called both right when you tap Post (createdAtMs ≈ now) and later, when
 *  rebuilding this same gist from the queue after a reload. Deliberately
 *  regenerates the preview URL from the stored Blob every single call
 *  rather than trusting a previously-created one: a `URL.createObjectURL`
 *  string only stays valid for the page session that created it — it goes
 *  dead across a reload even though the underlying Blob (persisted for
 *  real in IndexedDB) is completely unaffected. */
export function buildOfflineGistMedia(idKey: string, rawMedia: unknown): GistMedia[] | undefined {
  if (!Array.isArray(rawMedia) || rawMedia.length === 0) return undefined;
  return (rawMedia as QueuedMediaItem[]).map((item, i) => ({
    media_id: `offline-${idKey}-${i}`,
    gist_id: `offline-${idKey}`,
    order_index: i,
    media_type: item.kind === "video" ? "VIDEO" : "IMAGE",
    media_url: item.blob instanceof Blob ? URL.createObjectURL(item.blob) : (item.remoteUrl ?? ""),
    width: item.width ?? null,
    height: item.height ?? null,
  }));
}

/** The three offline gist mutations OfflineGistToast (mounted globally in
 *  the root layout) knows how to word a toast for. */
export type OfflineGistSaveAction = "created" | "edited" | "deleted" | "reported";

/** Tells OfflineGistToast to show — fired from every offline branch below
 *  (create/update/remove) rather than from whichever UI component happened
 *  to call them, since CreateGistSheet alone is opened from four different
 *  places (feed compose, profile compose, edit from either card's menu),
 *  and delete has its own separate call sites too. Centralizing here means
 *  every entry point gets the toast for free instead of needing its own
 *  copy of this wiring. */
function notifyOfflineSave(action: OfflineGistSaveAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OfflineGistSaveAction>("kampos:gist-offline-saved", { detail: action }));
}

/** Same four actions as OfflineGistSaveAction, but for the ONLINE success
 *  case — nothing told a user "that worked" before this, they just had to
 *  infer it from the gist appearing/disappearing/updating. */
export type GistActionSuccess = "created" | "edited" | "deleted" | "reported";

/** Tells GistActionToast (the same component OfflineGistToast renders from)
 *  a create/update/delete/report just succeeded for real, online. Fired
 *  directly from remove/report's own online branches below (nothing async
 *  happens after those succeed, so the moment the request resolves IS the
 *  moment it's true). create/edit are deliberately NOT fired from here —
 *  CreateGistSheet's create() call only posts the gist's text; media upload
 *  and a final getGist() still have to happen after that before the whole
 *  action is actually done (and can still roll back — a failed upload
 *  deletes the just-created gist again), so firing this from inside
 *  create()/update() themselves would celebrate something that might still
 *  fail a moment later. CreateGistSheet fires it itself once the whole
 *  multi-step flow has genuinely finished. */
export function notifyActionSucceeded(action: GistActionSuccess) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GistActionSuccess>("kampos:gist-action-succeeded", { detail: action }));
}

function buildOfflineGist(payload: Record<string, unknown>, idKey: string, createdAtMs: number): Gist {
  const { avitag: myAvitag, profiles } = useAuthStore.getState();
  const myProfile = profiles.find((p) => p.avitag === myAvitag);
  return {
    gist_id: `offline-${idKey}`,
    gist_text: String(payload.gist_text ?? ""),
    avitag: myAvitag ?? "",
    first_name: (myProfile?.first_name as string | undefined) ?? null,
    image_url: (myProfile?.image_url as string | undefined) ?? null,
    campus_tag: myProfile?.campus_tag as string | undefined,
    major_tag: myProfile?.major_tag as string | undefined,
    level: myProfile?.level as string | undefined,
    color_key: (payload.color_key as string | null | undefined) ?? null,
    my_reaction: null,
    my_report: false,
    media: buildOfflineGistMedia(idKey, payload.media),
    counts: { reactions_count: 0, comments_count: 0, views_count: 0, reports_count: 0, shares_count: 0 },
    // The moment it was actually queued, not "now" — matters once this is
    // called from getPendingGists() well after the fact (a reload 30
    // minutes after you actually wrote it shouldn't reset it to "just
    // now"). create()'s own call site passes the same enqueue() timestamp
    // it already gets back, so the tap-time case is unaffected — it's
    // already "now" at that exact moment anyway.
    created_at: new Date(createdAtMs).toISOString(),
  };
}

/** Mirrors applyPendingReactionOverlay/commentStore's getPendingCommentsByGist
 *  — a gist created while offline lives only in the queue (durable) and,
 *  until now, component state (gone on reload: FeedContent's own local
 *  `gists` array, which is what CreateGistSheet's onPosted callback
 *  actually prepends into, has nothing left in it after a fresh page
 *  load). Returns queued create-gist actions as synthetic Gist objects,
 *  newest first — the same order create()'s own repeated prepending would
 *  produce if you'd posted them one after another in a live session. */
async function getPendingGists(): Promise<Gist[]> {
  const pending: Gist[] = [];
  try {
    const queued = await getQueuedActions();
    for (const action of queued) {
      if (action.type !== "create-gist") continue;
      pending.unshift(buildOfflineGist(action.payload, action.id, action.ts));
    }
  } catch {
    // IndexedDB unavailable — skip the overlay rather than fail the fetch.
  }
  return pending;
}

// Two different TTLs for two different kinds of data, not one number for
// everything. List-shaped reads (the feed, a profile's gists) are what
// people actually sit and scroll through, so 5 minutes balances "feels
// current" against not re-fetching every time someone glances back.
// Single-gist reads (below) use a much shorter window instead — they're
// not about feeling fresh to one person, they're about absorbing a burst
// of strangers all opening the same shared link within the same minute
// without each one hitting the database individually.
const GIST_CACHE_TTL_MS = 5 * 60 * 1000;
const SHARE_VIEW_CACHE_TTL_MS = 60 * 1000;

// ── Cache helpers (Phase 2 — stale-while-revalidate) ────────────────────

/** Shared stale-while-revalidate read pattern used by byUser(), get(), and
 *  getContext(). (list()'s base-feed case no longer uses this at all — see
 *  its own comment for why a plain fetch-when-online/cache-when-offline
 *  split is the honest thing to do there instead.)
 *
 *  1. Check IndexedDB cache for `cacheKey` (skipped entirely when `force`
 *     is set — a deliberate user action like pull-to-refresh means "check
 *     the server right now," not "tell me what you already had on file").
 *  2. If cached AND fresh (within `ttlMs`): return cached data immediately,
 *     then fire the real network fetch in the background so the cache is
 *     warm for the NEXT read without the user waiting.
 *  3. If stale, missing, or forced: fetch from network, cache the result,
 *     return it. */
async function cachedRead<T>(
  cacheKey: string,
  fetcher: () => Promise<T | undefined>,
  onFresh?: (fresh: T) => void,
  force = false,
  ttlMs: number = GIST_CACHE_TTL_MS,
): Promise<T | undefined> {
  const cached = force ? null : await cacheGet<T>(cacheKey, ttlMs);
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

  /** The base feed (no cursor) always asks the server directly when
   * online — no cache check, no "force" needed, that was the whole point
   * of simplifying this. Only falls back to whatever's cached when
   * genuinely offline. A cursor (pagination) still goes through the real
   * cache, since revisiting a scroll position within a few minutes
   * genuinely benefits from not re-fetching. */
  list: (params?: Record<string, unknown>) => Promise<Gist[]>;
  /** Seeds `items` + the IndexedDB cache directly from data the server
   * already handed the page (SSR's own fetch) — no network round trip,
   * and no comparison against whatever's already cached. SSR data is the
   * freshest possible thing at the moment a page loads; running it through
   * list()'s normal cache-read path instead (as this used to) meant a
   * stale snapshot from a PREVIOUS visit could get written into `items`
   * and then, a moment later, get compared against the real fresh fetch
   * and flagged as "new gists" — a false-positive pill right after a
   * reload that had already shown the real content from the first paint. */
  primeFromServer: (gists: Gist[], params?: Record<string, unknown>) => void;
  trending: () => Promise<Gist[]>;
  /** A specific user's gists (profile page) — deliberately does NOT touch
   * `items`/`loading` like list()/trending() do. Those two back the main
   * feed; sharing state with them here would mean visiting a profile page
   * and returning to the feed shows stale/wrong gists until a refetch.
   * Matches get()/getContext()/counts()'s own read-only pattern below.
   * `total` is the backend's real count behind this pagination — only ever
   * present on a first page (no cursor), since it's the same number no
   * matter which page you're looking at and a cursor page would just be
   * recomputing it for nothing. */
  byUser: (
    avitag: string,
    params?: { limit?: number; cursor?: string },
  ) => Promise<{ items: Gist[]; total?: number }>;
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
  /** `offlineMedia` is only ever read on the offline branch (see its own
   * comment there) — the online path still handles media entirely
   * separately, via direct uploadMedia/removeMedia calls from
   * CreateGistSheet, same as it always has. Passing it here is purely how
   * an offline edit gets enough information queued to both preview the
   * change immediately and actually apply it once back online. */
  update: (
    gistId: string,
    gistText: string,
    offlineMedia?: { newMedia?: unknown[]; removedMediaIds?: string[] },
  ) => Promise<Gist | undefined>;
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
  /** Swaps in the fresh gists that arrived via background refresh, and
   * returns them so a caller keeping its own local copy of the list
   * (e.g. FeedContent) can mirror the swap instead of only updating this
   * store's own (largely unread) `items`. */
  loadNewGists: () => Promise<Gist[] | undefined>;
  /** Auto-hide path — the pill disappearing on its own after a few seconds
   * of not being tapped (see NewGistsPill's own timer), not the user acting
   * on it. Unlike loadNewGists, this never swaps in the fresh list — the
   * user didn't ask for it, so `items`/whatever's on screen stays exactly
   * as it was. Uses the longer NEW_GISTS_PILL_IGNORED_COOLDOWN_MS instead
   * of the tap cooldown: someone who let it disappear unread is a weaker
   * signal to come back soon than someone who engaged with it. */
  dismissNewGistsPill: () => void;
  /** Internal — the cache key from the last list() call, used by
   * loadNewGists to read the background-refreshed data from cache. */
  _lastListKey: string;
  /** Internal — timestamp (ms) before which a fresh pill isn't allowed to
   * surface, set 15 minutes out every time loadNewGists() runs. Without
   * this, back-to-back approvals during an active moderation burst meant
   * tapping the pill just got you a new one seconds later — the user ends
   * up chasing pills instead of actually reading the feed. New approvals
   * during the cooldown still refresh the cache in the background (so
   * whenever the pill does reappear it's current), they just don't surface
   * it early. 0 means no cooldown is active — the very first pill of a
   * session (before anyone's tapped one) is never held back by this. */
  _pillCooldownUntil: number;
  /** Which of the two main-feed pools is currently on screen — kept in
   * sync by FeedContent whenever its tab changes. Exists purely so the
   * module-level feed.global/GIST_APPROVED handler below (which has no
   * way to see FeedContent's own local `tab` state — it's a plain store
   * subscription, not a component) knows which `feed_mode` to fetch/cache
   * under when flagging the "new gists" pill. Without this, that handler
   * always fetched the unfiltered Amebo pool regardless of which tab was
   * actually active, so tapping the pill while on Gist could silently
   * swap in gists from every school instead of just your own. */
  activeFeedMode: "gist" | "amebo" | "school";
  /** Only meaningful when activeFeedMode is "school" — which campus's pill
   * is active. Kept alongside activeFeedMode (not folded into it) so the
   * module-level pill handler below can rebuild the exact same {feed_mode,
   * school} params the active tab is actually fetching with. */
  activeSchoolTag: string | null;
  setActiveFeedMode: (mode: "gist" | "amebo" | "school", schoolTag?: string | null) => void;
  /** The (up to 3) currently-trending other schools, for the pills beside
   * Amebo — see gist.repo.ts's getTrendingSchools for how "trending" is
   * computed. Empty when nothing qualifies; never padded. */
  trendingSchools: Array<{ campus_tag: string; score: number }>;
  fetchTrendingSchools: () => Promise<Array<{ campus_tag: string; score: number }>>;
  /** Snapshot of exactly what the feed looked like the moment you last left
   * it (e.g. tapped a poster's avatar to check their profile) — which list
   * of gists, which one was front-and-center, and which tab it was. Lives
   * here (a module-level store, not FeedContent's own state) specifically
   * because it needs to survive FeedContent unmounting entirely: navigating
   * to a sibling route like a profile page tears the component down, and a
   * brand-new instance mounts fresh on the way back with no memory of its
   * own — losing your scroll position even if the underlying data were
   * perfectly cached. Restoring straight from this on the next mount is
   * what actually fixes that, independent of any server/router-level
   * caching. Never trusted blindly past its own age — see FeedContent's own
   * FEED_SNAPSHOT_TTL_MS — and cleared on logout/account deletion so a
   * different account on the same browser never inherits a stale campus-
   * filtered snapshot that was never fetched for them. */
  feedSnapshot: {
    gists: Gist[];
    currentGistId: string | null;
    feedMode: "gist" | "amebo" | "school";
    schoolTag: string | null;
    savedAt: number;
  } | null;
  saveFeedSnapshot: (snapshot: {
    gists: Gist[];
    currentGistId: string | null;
    feedMode: "gist" | "amebo" | "school";
    schoolTag: string | null;
  }) => void;
}

const NEW_GISTS_PILL_COOLDOWN_MS = 15 * 60 * 1000;
// Longer than the tap cooldown above — see dismissNewGistsPill's own
// docstring for why an ignored pill backs off further than a tapped one.
const NEW_GISTS_PILL_IGNORED_COOLDOWN_MS = 25 * 60 * 1000;

// How old a saved feedSnapshot is still allowed to be before it's treated
// as if it never existed — matches DEFAULT_CACHE_TTL_MS in dataCache.ts,
// this app's existing "how stale is a feed allowed to be" convention.
export const FEED_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

/** Reads feedSnapshot, but only if still within FEED_SNAPSHOT_TTL_MS — a
 * stale one is treated exactly like no snapshot at all by every caller.
 * Exported (not just used internally) because feed/loading.tsx needs the
 * exact same freshness check FeedContent uses, at the exact same moment —
 * see loading.tsx's own comment for why. Plain function, not a hook: both
 * call sites only ever need to read this once, at mount, not subscribe to
 * it. */
export function getFreshFeedSnapshot() {
  const snap = useGistStore.getState().feedSnapshot;
  if (!snap) return null;
  if (Date.now() - snap.savedAt > FEED_SNAPSHOT_TTL_MS) return null;
  return snap;
}

export const useGistStore = create<GistState>((set, get) => ({
  items: [],
  _pillCooldownUntil: 0,
  activeFeedMode: "gist",
  activeSchoolTag: null,
  setActiveFeedMode: (mode, schoolTag = null) => set({ activeFeedMode: mode, activeSchoolTag: mode === "school" ? schoolTag : null }),
  trendingSchools: [],
  feedSnapshot: null,
  saveFeedSnapshot: (snapshot) => set({ feedSnapshot: { ...snapshot, savedAt: Date.now() } }),
  fetchTrendingSchools: async () => {
    try {
      const data = (await apiGet<Array<{ campus_tag: string; score: number }>>("/gists/trending-schools")) ?? [];
      set({ trendingSchools: data });
      return data;
    } catch {
      // Best-effort — the pill row just shows Gist/Amebo alone if this fails.
      return get().trendingSchools;
    }
  },
  loading: false,
  error: null,
  hasNewGists: false,
  _lastListKey: "",

  list: async (params = {}) => {
    set({ loading: true, error: null });
    const key = cacheKey("/gists", params);
    // The "new gists" pill no longer has anything to do with this function
    // at all — it's driven entirely by the feed.global WebSocket broadcast
    // (see the module-level subscription below), which does its own direct
    // fetch-and-cache the moment something is genuinely new. Comparing
    // against a background refetch here was a leftover from before that
    // existed and had already been narrowed down to pure dead weight: SSR
    // covers the first paint, pull-to-refresh always wants the server
    // directly, and the pill's own trigger already re-fetches for real —
    // nothing was left actually reading a "stale-but-fresh-enough" copy of
    // the base feed.
    //
    // A paginated loadMore() call has its own, per-cursor cache key —
    // genuinely worth keeping cached (scroll down, back up, back down
    // within a few minutes and it's instant), so that path still goes
    // through cachedRead below. The base feed doesn't: online, it always
    // asks the server directly and just writes the result through to
    // storage for later; offline, it reads back whatever was last written,
    // however old — the one place caching here is still earning its keep
    // is exactly that offline fallback, not freshness optimization.
    const isBaseFeed = !("cursor" in params && params.cursor);
    if (isBaseFeed) set({ _lastListKey: key });
    try {
      let data: Gist[] | undefined;
      if (isBaseFeed) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          data = (await cacheGet<Gist[]>(key)) ?? undefined;
          if (!data) throw new Error("Offline and no cached feed available");
        } else {
          data = await apiGet<Gist[]>("/gists", { params });
          if (data) cacheSet(key, data).catch(() => {});
        }
      } else {
        data = await cachedRead<Gist[]>(key, () => apiGet<Gist[]>("/gists", { params }));
      }
      let normalized = await applyPendingReactionOverlay(normalizeGists(data ?? []));
      // Only on the base feed, never a loadMore() continuation — a pending
      // offline gist belongs at the very top of the feed exactly once, not
      // re-inserted into every paginated page. Restores it after a reload
      // that happened while still offline, when FeedContent's own local
      // `gists` state (what CreateGistSheet's onPosted normally prepends
      // into) has nothing left in it — see getPendingGists's own comment.
      if (isBaseFeed) {
        const pendingGists = await getPendingGists();
        if (pendingGists.length > 0) normalized = [...pendingGists, ...normalized];
      }
      set({ items: normalized, loading: false });
      return normalized;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load gists"), loading: false });
      throw err;
    }
  },

  primeFromServer: (gists, params = { limit: 30 }) => {
    const key = cacheKey("/gists", params);
    set({ items: normalizeGists(gists), _lastListKey: key, hasNewGists: false });
    // Fire-and-forget — this just needs to land before the next cache read,
    // not before this call returns.
    cacheSet(key, gists).catch(() => {});
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
    const page = await cachedRead<{ data: Gist[]; total?: number }>(key, async () => {
      const res = await api.get<ApiEnvelope<Gist[]> & { total?: number }>(
        `/gists/user/${encodeURIComponent(avitag)}`,
        { params },
      );
      return { data: res.data?.data ?? [], total: res.data?.total };
    });
    let normalized = await applyPendingReactionOverlay(normalizeGists(page?.data ?? []));
    // Same reasoning as list()'s own pending-gist overlay — only makes
    // sense on your own profile (a pending gist belongs to whoever queued
    // it, never shown on someone else's page) and only on the first page,
    // never a loadMore() continuation.
    if (!params?.cursor && avitag === useAuthStore.getState().avitag) {
      const pendingGists = await getPendingGists();
      if (pendingGists.length > 0) normalized = [...pendingGists, ...normalized];
    }
    return { items: normalized, total: page?.total };
  },

  get: async (gistId) => {
    try {
      // Cached now (60s) — this is the one meaningfully-trafficked read
      // that was never cached at all despite being the most likely to get
      // hit by a real burst (a link going around a group chat sends many
      // strangers at this exact same gist within the same minute). Short
      // TTL because it's not about feeling fresh to one visitor, it's
      // about not sending every one of them straight to the database.
      const key = cacheKey(`/gists/${gistId}`);
      const data = await cachedRead<Gist>(
        key,
        () => apiGet<Gist>(`/gists/${encodeURIComponent(gistId)}`),
        undefined,
        false,
        SHARE_VIEW_CACHE_TTL_MS,
      );
      if (!data) return data;
      const [withOverlay] = await applyPendingReactionOverlay([normalizeGist(data)]);
      return withOverlay;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to load gist") });
      throw err;
    }
  },

  getContext: async (gistId, before = 15, after = 15) => {
    try {
      // Same reasoning as get() above — the actual share-link page uses
      // this, not get(), so this is the one that matters most for a real
      // WhatsApp-style traffic burst.
      const key = cacheKey(`/gists/${gistId}/context`, { before, after });
      const data = await cachedRead<{ target: Gist; before: Gist[]; after: Gist[] }>(
        key,
        () =>
          apiGet<{ target: Gist; before: Gist[]; after: Gist[] }>(`/gists/${encodeURIComponent(gistId)}/context`, {
            params: { before, after },
          }),
        undefined,
        false,
        SHARE_VIEW_CACHE_TTL_MS,
      );
      if (!data) return data;
      // One overlay pass across target+before+after together rather than
      // three separate queue reads — same reconstructed reaction map
      // applies to all of them, and the queue read is the only async part.
      const combined = await applyPendingReactionOverlay([
        normalizeGist(data.target),
        ...normalizeGists(data.before),
        ...normalizeGists(data.after),
      ]);
      const beforeLen = data.before.length;
      return {
        target: combined[0],
        before: combined.slice(1, 1 + beforeLen),
        after: combined.slice(1 + beforeLen),
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
      const queued = await enqueue({ type: "create-gist", payload });
      // Real Gist field names (first_name/image_url/campus_tag/major_tag/
      // level — not display_name/campus/major, which nothing in GistCard
      // reads) so it actually renders with your name/avatar/tags instead
      // of blank. Gets replaced once the real gist comes back from the
      // server after flush (see flushOfflineQueue).
      const optimistic = buildOfflineGist(payload, queued.id, queued.ts);
      // Prepend to the feed so the user sees it right away.
      set((s) => ({ items: [optimistic, ...s.items] }));
      notifyOfflineSave("created");
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

  update: async (gistId, gistText, offlineMedia) => {
    // Offline — queue the edit so it replays when connectivity returns.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const newMedia = offlineMedia?.newMedia ?? [];
      const removedMediaIds = offlineMedia?.removedMediaIds ?? [];
      await enqueue({
        type: "update-gist",
        payload: { gist_id: gistId, gist_text: gistText, media: newMedia, removed_media_ids: removedMediaIds },
      });
      // Apply optimistic text + media update to the local item immediately
      // — kept media minus whatever was removed, plus fresh previews for
      // whatever was newly picked (buildOfflineGistMedia, same helper
      // create()'s own offline branch uses). Returned (not just applied to
      // `items`) so CreateGistSheet's offline branch — which drives its
      // own separate local `gists` array via onPosted, not this store's
      // `items` — can hand the exact same merged gist to that callback
      // instead of re-deriving it independently.
      const addedMedia = buildOfflineGistMedia(gistId, newMedia) ?? [];
      let merged: Gist | undefined;
      set((s) => ({
        items: s.items.map((g) => {
          if (g.gist_id !== gistId) return g;
          const keptMedia = (g.media ?? []).filter((m) => !removedMediaIds.includes(m.media_id));
          merged = { ...g, gist_text: gistText, media: [...keptMedia, ...addedMedia] };
          return merged;
        }),
      }));
      notifyOfflineSave("edited");
      return merged;
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
      notifyOfflineSave("deleted");
      return;
    }
    try {
      await api.delete(`/gists/${encodeURIComponent(gistId)}`);
      set((s) => ({ items: s.items.filter((g) => g.gist_id !== gistId) }));
      cacheDeleteMatching(/^GET:\/gists/).catch(() => {});
      notifyActionSucceeded("deleted");
    } catch (err) {
      set({ error: apiErrorMessage(err, "Failed to delete gist") });
      throw err;
    }
  },

  report: async (gistId, reason) => {
    // Offline — queue it and resolve as if it succeeded, same as
    // react/unreact/create-comment below: the caller (GistCard) marks the
    // gist reported and closes the modal immediately, no error shown.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ type: "report-gist", payload: { gist_id: gistId, reason: reason ?? null } });
      notifyOfflineSave("reported");
      return;
    }
    try {
      await api.post(`/gists/${encodeURIComponent(gistId)}/report`, reason ? { reason } : {});
      notifyActionSucceeded("reported");
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
    // Offline — the optimistic update above already stands; queue the real
    // write for when connectivity returns instead of failing it outright.
    // Deliberately no error, no rollback: this isn't a failure, it's queued.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ type: "react-gist", payload: { gist_id: gistId, type } });
      return;
    }
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
    // Offline — same reasoning as react() above: queue it, keep the
    // optimistic un-react as-is, no error.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueue({ type: "unreact-gist", payload: { gist_id: gistId } });
      return;
    }
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

  /** Replays all queued offline mutations (create/update/delete gist,
   * react/unreact, create-comment) in FIFO order and then invalidates the
   * gist cache so the next feed read picks up the new data. Call this from
   * useNetworkStatus's onReconnect. */
  flushOfflineQueue: async () => {
    const { flush } = await import("@/lib/offlineQueue");
    // Set true the moment any create/update/delete-gist action actually
    // lands for real — see where it's read, right after flush() below, for
    // why: a feedSnapshot taken before this point can only be trusted for
    // "which gist was in front of you," never for "is this exact list of
    // gists/ids still accurate," since a gist it captured might have been
    // a since-superseded offline- placeholder, or one that's since been
    // edited/deleted. react/unreact/create-comment don't change the SET of
    // gists a feed shows, only counts/comments on an already-real one, so
    // they don't invalidate anything here.
    let gistListChanged = false;
    // Lets a mounted feed patch its local list IN PLACE instead of throwing
    // it away and re-fetching page one from scratch (the old behavior).
    // That full-refetch approach was the real cause of two separate bugs a
    // user would notice on every single reconnect: the front-and-center
    // gist would visibly jump to something else (the local array got fully
    // replaced by a freshly re-sorted page one, and whatever GistCard sat
    // at the same numeric index just showed whatever new content landed
    // there — see GistStack's own reconciliation logic, which this pairs
    // with), and a gist could appear twice (the fresh page-one fetch races
    // the feed's own separate pagination cursor, which still expects to
    // continue from the PRE-sync ordering — the two can overlap on a
    // shared gist once loadMore continues). Swapping just the placeholder
    // gist_id for the real one, at the exact same array slot, avoids both:
    // nothing reorders, nothing gets re-fetched, nothing overlaps.
    // `gist` carries the fully-hydrated real gist (real Cloudinary media
    // URLs included) when the follow-up fetch below succeeds — see where
    // it's populated for why a mounted feed needs the WHOLE object, not
    // just the new id.
    const syncedCreates: { oldId: string; newId: string; gist?: Gist }[] = [];
    const deletedGistIds: string[] = [];
    // Uploads whatever media was queued alongside a create/update-gist
    // action, once the gist itself is confirmed to exist for real. Errors
    // here are swallowed per-item, deliberately never rethrown into the
    // caller — the gist's TEXT has already been successfully posted/patched
    // by the time this runs, so letting a media failure bubble up would
    // mark the whole action as failed and retry it from the top, which
    // means re-POSTing the text and creating a genuine duplicate gist. A
    // media item that still can't upload even now (rare — the common
    // "offline" case is handled by queuing in the first place) is just
    // dropped; there's no dedup-safe way to retry only that one piece
    // within this queue's current design.
    const uploadQueuedMedia = async (gistId: string, items: QueuedMediaItem[]) => {
      for (const item of items) {
        try {
          if (item.blob instanceof Blob) {
            await get().uploadMedia(gistId, item.blob, item.name);
          } else if (item.remoteUrl) {
            await get().attachMediaUrl(gistId, item.remoteUrl, item.width, item.height);
          }
        } catch (err) {
          console.error("[offline-queue] queued media upload failed:", gistId, err);
        }
      }
    };
    await flush(async (action) => {
      switch (action.type) {
        case "create-gist": {
          const { media, ...jsonPayload } = action.payload as { media?: unknown[]; [key: string]: unknown };
          const res = await api.post<ApiEnvelope<{ gist_id: string }>>("/gists", jsonPayload);
          const gistId = res.data?.data?.gist_id;
          if (gistId && Array.isArray(media) && media.length) {
            await uploadQueuedMedia(gistId, media as QueuedMediaItem[]);
          }
          if (gistId) {
            // The local placeholder's media is still pointing at local
            // blob: preview URLs, which the cleanup below is about to
            // revoke (the browser's object-URL registry isn't scoped per
            // array copy — revoking it breaks every reference to that same
            // URL string anywhere, including a mounted feed's own local
            // copy of this gist). The id-only swap this used to do left
            // exactly that stale, about-to-be-revoked blob: URL behind in
            // media, which is why the card kept its real content but its
            // media turned into a broken/grey box right as this flush
            // finished. Fetching the real gist back gives a mounted feed
            // the actual Cloudinary URLs to swap in instead — same as what
            // the ONLINE create flow already does via getGist() before
            // calling onPosted (see CreateGistSheet). Never let a failure
            // here fail the whole action — the text (and media) already
            // posted successfully; a mounted feed just falls back to the
            // narrower id-only patch and keeps whatever it was showing.
            let freshGist: Gist | undefined;
            try {
              freshGist = await get().get(gistId);
            } catch (err) {
              console.error("[offline-queue] failed to re-fetch synced gist:", gistId, err);
            }
            syncedCreates.push({ oldId: `offline-${action.id}`, newId: gistId, gist: freshGist });
          }
          gistListChanged = true;
          break;
        }
        case "update-gist": {
          const gistId = String(action.payload.gist_id);
          await api.patch(`/gists/${encodeURIComponent(gistId)}`, { gist_text: action.payload.gist_text });
          const removedMediaIds = action.payload.removed_media_ids;
          if (Array.isArray(removedMediaIds)) {
            for (const mediaId of removedMediaIds) {
              try {
                await get().removeMedia(String(mediaId));
              } catch (err) {
                console.error("[offline-queue] queued media removal failed:", mediaId, err);
              }
            }
          }
          const media = action.payload.media;
          if (Array.isArray(media) && media.length) {
            await uploadQueuedMedia(gistId, media as QueuedMediaItem[]);
          }
          gistListChanged = true;
          break;
        }
        case "delete-gist":
          await api.delete(
            `/gists/${encodeURIComponent(String(action.payload.gist_id))}`,
          );
          deletedGistIds.push(String(action.payload.gist_id));
          gistListChanged = true;
          break;
        case "react-gist":
          await api.post("/reactions", {
            entity_type: "GIST",
            entity_id: action.payload.gist_id,
            type: action.payload.type,
          });
          break;
        case "unreact-gist":
          await api.delete(
            `/reactions/entity/GIST/${encodeURIComponent(String(action.payload.gist_id))}`,
          );
          break;
        case "create-comment":
          await api.post("/comments", {
            gist_id: action.payload.gist_id,
            text: action.payload.text,
          });
          break;
        case "report-gist":
          await api.post(`/gists/${encodeURIComponent(String(action.payload.gist_id))}/report`, {
            reason: action.payload.reason ?? undefined,
          });
          break;
      }
    });
    // Strip optimistic (offline- prefixed) gists from the feed now that
    // the real ones have been POSTed to the server.  The next feed fetch
    // will bring back the canonical versions. Release any local blob:
    // preview URLs their media was using first — the real, Cloudinary-
    // hosted versions are taking over, so the temporary local ones (each
    // one pinning a copy of the actual file data in memory for as long as
    // it stays alive) have nothing left to point at.
    set((s) => {
      for (const g of s.items) {
        if (!g.gist_id.startsWith("offline-")) continue;
        for (const m of g.media ?? []) {
          if (m.media_url.startsWith("blob:")) URL.revokeObjectURL(m.media_url);
        }
      }
      return { items: s.items.filter((g) => !g.gist_id.startsWith("offline-")) };
    });
    // The feed's own scroll-position bookmark (see feedSnapshot's own
    // docstring) can now be stale in a way that causes a real, visible
    // duplicate: it might still hold the offline- placeholder for a gist
    // that's since synced for real. If FeedContent happens to not be
    // mounted right now — kampos:gists-synced above has nobody listening,
    // since it only reaches an ACTIVE listener, never queued for later —
    // nothing else will ever correct that snapshot. The next time the feed
    // mounts, it would restore straight from it: the stale placeholder
    // shows once at the top (from the snapshot), and the same gist, now
    // real, shows again wherever it actually ranks once you scroll far
    // enough to reach a freshly-fetched page — two copies of one gist, one
    // stale-optimistic and one real. Clearing the snapshot here (only when
    // a create/update/delete-gist actually landed — see gistListChanged)
    // means that next mount has nothing to wrongly trust and falls back to
    // a genuine fresh fetch instead.
    if (gistListChanged) {
      set({ feedSnapshot: null });
    }
    // Same idea for comments — the real ones replace them via the
    // comment:created WS broadcast the server fires as part of each POST
    // above (see commentStore's own dedup-aware subscriber for that side).
    // Dynamic import avoids a static circular dependency between the two
    // stores; gistStore is the one already orchestrating the whole queue.
    const { useCommentStore } = await import("@/stores/commentStore");
    useCommentStore.setState((s) => {
      const itemsByGist: typeof s.itemsByGist = {};
      for (const [gid, comments] of Object.entries(s.itemsByGist)) {
        itemsByGist[gid] = comments.filter((c) => !c.comment_id.startsWith("offline-"));
      }
      return { itemsByGist };
    });
    // Tell any mounted feed UI to patch its local list — this store's own
    // `items` isn't what FeedContent actually renders (it keeps its own
    // local copy), so without this signal a successfully-synced offline
    // post just silently never appears until the user manually reloads the
    // page. Only fired when a create/update/delete-gist actually landed —
    // OfflineSync calls this speculatively on every reconnect AND on every
    // fresh mount regardless of whether the queue held anything gist-list-
    // shaped (an empty queue, or one holding only reactions/comments,
    // neither of which change what's IN the list), and firing this
    // unconditionally used to mean the feed would jump/reload on every
    // single reconnect for no reason at all.
    if (gistListChanged && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("kampos:gists-synced", { detail: { syncedCreates, deletedGistIds } }),
      );
    }
  },

  /** Swaps in the fresh gists that the background refresh already cached —
   * no network call, instant. Called when the user taps the pill. Returns
   * the fresh list so a caller with its own local copy (FeedContent) can
   * mirror the swap instead of only updating this store's own `items`. */
  loadNewGists: async () => {
    const key = get()._lastListKey;
    set({ hasNewGists: false, _pillCooldownUntil: Date.now() + NEW_GISTS_PILL_COOLDOWN_MS });
    if (!key) return undefined;
    try {
      const fresh = await cacheGet<Gist[]>(key);
      if (!fresh) return undefined;
      const normalized = normalizeGists(fresh);
      set({ items: normalized });
      return normalized;
    } catch {
      return undefined;
    }
  },

  dismissNewGistsPill: () => {
    set({ hasNewGists: false, _pillCooldownUntil: Date.now() + NEW_GISTS_PILL_IGNORED_COOLDOWN_MS });
  },
}));

// One shared subscription for the whole app: when an admin approves a
// gist, warm the base feed's cache with the real current list and flag
// the "new gists" pill. Module-level (not component-level), same pattern
// commentStore.ts uses for comment:created, so it keeps working
// regardless of whether the feed even happens to be the mounted page
// right now — arriving back on /feed later, primeFromServer's own reset
// (see FeedContent's mount effect) clears a stale flag if you weren't
// actually there when it fired.
//
// Deliberately does NOT trust the broadcast's own `gist` payload for
// display — moderation.service.ts's approveGist returns a bare
// `RETURNING *` row with no poster name/avatar/counts/media joined in,
// nothing GistCard could render correctly. This is only a signal that
// something changed; the real list is always re-fetched for real.
// Pending reveal timer for the "new gists" pill — see the cooldown
// reasoning on _pillCooldownUntil above. Module-level (one timer for the
// whole app, matching the module-level WS subscriptions around it), reset
// on every approval that lands mid-cooldown so it always targets the
// actual cooldown end regardless of how many approvals arrive before then.
let pillRevealTimer: ReturnType<typeof setTimeout> | null = null;

// Dev-mode Fast Refresh re-runs this module every time this FILE is
// edited — wsClient itself is a separate, untouched singleton, so without
// this guard, every single edit tonight left behind one more stale
// "feed.global"/"counts:updated" listener still attached to it, each one
// closed over whatever store instance existed at that moment. One real
// broadcast would then fire ALL of them at once — every accumulated
// listener independently re-fetching /gists, multiplying one approval
// into a dozen-plus redundant requests competing for the same connection
// pool. Storing the unsubscribe functions on globalThis (which survives a
// module reload, unlike a plain module-level variable) means each reload
// tears down its predecessor before attaching its own — exactly one live
// listener at all times, always the one bound to the current store. A
// genuine first load in production behaves identically; this is a no-op
// safety net there, not a behavior change.
const wsHandles = globalThis as unknown as {
  __kamposFeedGlobalUnsub?: () => void;
  __kamposCountsUnsub?: () => void;
};
wsHandles.__kamposFeedGlobalUnsub?.();
wsHandles.__kamposCountsUnsub?.();

if (typeof window !== "undefined") {
  wsHandles.__kamposFeedGlobalUnsub = wsClient.subscribe("feed.global", (payload) => {
    const p = payload as { type?: string; gist_id?: string } | undefined;

    if (p?.type === "GIST_APPROVED") {
      // Must match whichever tab is actually on screen — the backend
      // defaults an absent feed_mode to the unfiltered Amebo pool, so
      // omitting this here (as this used to) meant tapping the pill while
      // on Gist could silently swap in gists from every school, not just
      // your own. A school-tab viewer needs the ?school= param too, or
      // the backend would silently degrade "school" mode to unfiltered.
      const activeMode = useGistStore.getState().activeFeedMode;
      const activeSchool = useGistStore.getState().activeSchoolTag;
      const params: Record<string, unknown> = { limit: 30, feed_mode: activeMode };
      if (activeMode === "school" && activeSchool) params.school = activeSchool;
      const key = cacheKey("/gists", params);
      apiGet<Gist[]>("/gists", { params })
        .then((fresh) => {
          if (!fresh) return;
          cacheSet(key, fresh).catch(() => {});
          const cooldownUntil = useGistStore.getState()._pillCooldownUntil;
          const now = Date.now();
          if (cooldownUntil > now) {
            // Still cooling down from the last time the user acted on a
            // pill — keep the cache/key current (so whenever it does
            // surface it's the real latest list) without popping a new
            // prompt on top of one they just dismissed. Schedule the
            // reveal for exactly when the cooldown ends, in case this is
            // the only approval during the window — without this, a lone
            // approval mid-cooldown with nothing after it would never
            // surface at all, since nothing else would be left to "wake"
            // hasNewGists back on.
            useGistStore.setState({ _lastListKey: key });
            if (pillRevealTimer) clearTimeout(pillRevealTimer);
            pillRevealTimer = setTimeout(() => {
              pillRevealTimer = null;
              useGistStore.setState({ hasNewGists: true });
            }, cooldownUntil - now);
          } else {
            useGistStore.setState({ hasNewGists: true, _lastListKey: key });
          }
        })
        .catch(() => {});
      return;
    }

    if (p?.type === "GIST_REJECTED" && p.gist_id) {
      const gistId = p.gist_id;
      // The store's own `items` isn't what any page actually renders (see
      // primeFromServer's own docstring for the whole reason that split
      // exists) — this event is the real delivery mechanism, for whichever
      // page/component currently has this exact gist on screen to decide
      // what "removed" means for its own layout (feed/profile drop it
      // entirely; the share view instead flips it to the same REJECTED
      // placeholder GistCard already renders for an old shared link).
      useGistStore.setState((s) => ({ items: s.items.filter((g) => g.gist_id !== gistId) }));
      window.dispatchEvent(new CustomEvent("kampos:gist-rejected", { detail: { gist_id: gistId } }));
    }
  });

  // Live reaction/comment counts — the backend's counts:updated broadcast
  // actually carries all five fields any time ANY of them change on a
  // gist (view/share/react/comment, from anyone), but views_count and
  // shares_count are deliberately NOT applied here. Those two don't have
  // the optimistic-tap UX reactions/comments do — nobody's watching them
  // expecting a live tick — so treating them as fetch-and-forget (whatever
  // came back from the last real load/reload) instead of WS-live cuts a
  // meaningful amount of reconciliation complexity (this whole feature's
  // actual bug history) for a metric nobody was watching move anyway.
  // They still stay correct on every reload/pull-to-refresh — just not
  // between them. Only reactions_count/reactions_by_type/comments_count
  // are applied; patch the store's `items` for any code that reads from
  // it, and broadcast a DOM event for the pages that keep their own local
  // copy instead.
  wsHandles.__kamposCountsUnsub = wsClient.subscribe("counts:updated", (payload) => {
    // The backend sends { gist_id, counts: {...}, reactions_by_type: {...} }
    // (see GistService.getCountsFull) — the flat count fields live under
    // `counts`, not on the payload itself.
    const p = payload as
      | {
          gist_id?: string;
          counts?: Partial<Record<keyof GistCounts, number>>;
          reactions_by_type?: GistCounts["reactions_by_type"];
        }
      | undefined;
    if (!p?.gist_id) return;
    const gistId = p.gist_id;
    const patch: Partial<GistCounts> = {};
    (["reactions_count", "comments_count"] as const).forEach((k) => {
      const v = p.counts?.[k];
      if (typeof v === "number") patch[k] = v;
    });
    if (p.reactions_by_type) patch.reactions_by_type = p.reactions_by_type;
    if (Object.keys(patch).length === 0) return;

    useGistStore.setState((s) => ({
      items: s.items.map((g) => (g.gist_id === gistId ? { ...g, counts: { ...g.counts, ...patch } as Gist["counts"] } : g)),
    }));
    window.dispatchEvent(new CustomEvent("kampos:gist-counts-updated", { detail: { gist_id: gistId, counts: patch } }));
  });
}
