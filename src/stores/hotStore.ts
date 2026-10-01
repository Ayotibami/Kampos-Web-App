import { create } from "zustand";
import axios from "axios";
import { api, apiGet, apiErrorMessage, type ApiEnvelope } from "@/lib/api";
import { uploadToCloudinaryDirect, type CloudinarySignature, type CloudinaryUploadResult } from "@/lib/cloudinary";
import { wsClient } from "@/lib/ws";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which leg of a direct-to-Cloudinary upload failed — same idea as
 * gistStore's own MediaUploadStage/MediaUploadError, kept as a separate
 * type here rather than imported from gistStore since nothing about it is
 * actually Gist-specific and importing across feature stores for a
 * three-line type isn't worth the coupling. */
export type HotUploadStage = "signature" | "upload" | "create";
export class HotUploadError extends Error {
  stage: HotUploadStage;
  constructor(stage: HotUploadStage, message: string) {
    super(message);
    this.stage = stage;
  }
}

export type HotMediaType = "text" | "photo" | "video";

export interface HotPost {
  id: string;
  avitag: string;
  type: HotMediaType;
  text: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  colorKey: string | null;
  /** Epoch ms — a display-only timer value for the ring's burn-down arc,
   * computed client-side as createdAt + 24h. Never authoritative: the
   * SERVER decides real visibility (every fetch already filters to the
   * last 24h), so a post that's actually expired simply won't be in the
   * next fetch at all, whether or not this client-side number agrees yet. */
  createdAt: number;
  expiresAt: number;
  durationMs: number | null;
  seen: boolean;
}

export interface HotPerson {
  avitag: string;
  firstName: string;
  imageUrl: string | null;
  campusTag: string | null;
  majorTag: string | null;
  level: number | null;
  /** Student profiles only, same as campusTag/majorTag/level — null for a
   * KREATOR/KOMPANY/SCHOOL/IDIOT poster, by design not a bug (see
   * hot.repo.ts's AUTHOR_COLUMNS doc comment on the backend). */
  bio: string | null;
  posts: HotPost[];
}

interface RawHotPost {
  hot_post_id: string;
  avitag: string;
  media_kind: "TEXT" | "PHOTO" | "VIDEO";
  text: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  color_key: string | null;
  duration_ms: number | null;
  created_at: string;
  first_name?: string | null;
  image_url?: string | null;
  campus_tag?: string | null;
  major_tag?: string | null;
  level?: number | null;
  seen?: boolean;
  tier?: number;
}

const MEDIA_KIND_MAP: Record<RawHotPost["media_kind"], HotMediaType> = {
  TEXT: "text",
  PHOTO: "photo",
  VIDEO: "video",
};

/** `/hot-posts/feed`'s actual response shape — hot.service.ts's listFeed
 * already groups the flat SQL rows by author server-side (see its own doc
 * comment), so this is what actually comes back: one entry per person,
 * each carrying its OWN raw post rows nested in `.posts`. Person-level
 * fields (first_name/image_url/campus_tag/major_tag/level) live here, not
 * repeated meaningfully per post — every post row also carries them
 * (hot.repo.ts's AUTHOR_COLUMNS joins them onto every row), but this is
 * the one place fromRaw's `row.first_name` etc. actually resolve from. */
interface RawHotFeedPerson {
  avitag: string;
  first_name: string | null;
  image_url: string | null;
  campus_tag: string | null;
  major_tag: string | null;
  level: number | null;
  bio: string | null;
  tier: number;
  posts: RawHotPost[];
}

function fromRaw(row: RawHotPost): HotPost {
  const createdAt = new Date(row.created_at).getTime();
  return {
    id: row.hot_post_id,
    avitag: row.avitag,
    type: MEDIA_KIND_MAP[row.media_kind],
    text: row.text ?? null,
    mediaUrl: row.media_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    colorKey: row.color_key ?? null,
    createdAt,
    expiresAt: createdAt + DAY_MS,
    durationMs: row.duration_ms ?? null,
    seen: row.seen ?? false,
  };
}

// Warms the browser's own image cache for every photo (full image) and
// video (its Cloudinary-rendered poster frame, not the clip itself — a
// full video prefetch for every post in the feed is real bandwidth that
// most of these will never even be opened to use) as soon as a fetch
// resolves, so by the time someone actually taps into a stack the media
// is very likely already decoded and sitting in cache instead of starting
// its request only once EDeyHotViewer's own <img>/<video> mounts. Fire-
// and-forget: a `new Image()` whose `.src` is set starts loading and keeps
// the request alive via the browser's own cache even though nothing here
// ever reads `.onload` — EDeyHotViewer's own onLoad/onLoadedData is what
// actually clears its spinner once the real element mounts and finds the
// request already warm (or already complete).
function preloadHotMedia(posts: HotPost[]): void {
  if (typeof window === "undefined") return;
  for (const post of posts) {
    const url = post.type === "video" ? post.thumbnailUrl : post.mediaUrl;
    if (!url) continue;
    const img = new Image();
    img.src = url;
  }
}

function groupFeed(people: RawHotFeedPerson[]): HotPerson[] {
  // The backend's own listFeed already groups by author AND sorts (tier
  // ASC, then soonest-expiring author first) — this just re-shapes each
  // entry into HotPerson, no re-sort or re-grouping needed here.
  return people.map((person) => ({
    avitag: person.avitag,
    firstName: person.first_name || person.avitag,
    imageUrl: person.image_url ?? null,
    campusTag: person.campus_tag ?? null,
    majorTag: person.major_tag ?? null,
    level: person.level ?? null,
    bio: person.bio ?? null,
    posts: person.posts.map(fromRaw),
  }));
}

interface HotState {
  myPosts: HotPost[];
  feed: HotPerson[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  createText: (text: string, colorKey: string) => Promise<HotPost>;
  createMedia: (
    file: Blob,
    mediaKind: "photo" | "video",
    filename: string,
    text: string | null,
    onProgress?: (percent: number) => void,
  ) => Promise<HotPost>;
  deletePost: (hotPostId: string) => Promise<void>;
  /** Fire-and-forget from the UI's point of view — updates local state
   * immediately (so the ring/viewer reflect it right away) and queues the
   * id for the next batched flush rather than a network round trip per
   * post. */
  markSeen: (hotPostId: string) => void;
  /** Sends every queued id in ONE call — see hot.repo.ts's markSeenBatch on
   * the backend for why this is batched rather than per-post. Call this
   * when the viewer closes or moves to a different person's stack, not on
   * every single post. */
  flushSeen: () => Promise<void>;
}

let seenQueue: string[] = [];
let feedRefetchTimer: ReturnType<typeof setTimeout> | null = null;

export const useHotStore = create<HotState>((set, get) => ({
  myPosts: [],
  feed: [],
  loaded: false,
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [mine, feedPeople] = await Promise.all([
        apiGet<RawHotPost[]>("/hot-posts/mine"),
        apiGet<RawHotFeedPerson[]>("/hot-posts/feed"),
      ]);
      const myPosts = (mine ?? []).map(fromRaw);
      const feed = groupFeed(feedPeople ?? []);
      set({ myPosts, feed, loaded: true, loading: false });
      preloadHotMedia([...myPosts, ...feed.flatMap((p) => p.posts)]);
    } catch (err) {
      // `loaded` still flips true here — otherwise a genuine failure (offline,
      // backend down) leaves EDeyHotRail's skeleton shimmering forever with
      // no way out, instead of falling back to the ordinary empty state.
      set({ loading: false, loaded: true, error: apiErrorMessage(err, "Couldn't load As e dey hot") });
    }
  },

  createText: async (text, colorKey) => {
    try {
      const res = await api.post<ApiEnvelope<RawHotPost>>("/hot-posts", {
        media_kind: "TEXT",
        text,
        color_key: colorKey,
      });
      if (!res.data?.data) throw new Error("No post returned");
      const post = fromRaw(res.data.data);
      set((s) => ({ myPosts: [...s.myPosts, post] }));
      return post;
    } catch (err) {
      throw new HotUploadError("create", apiErrorMessage(err, "Couldn't post that"));
    }
  },

  createMedia: async (file, mediaKind, filename, text, onProgress) => {
    let sig: CloudinarySignature & { hot_post_id: string };
    try {
      const res = await api.post<ApiEnvelope<CloudinarySignature & { hot_post_id: string }>>(
        "/hot-posts/upload-signature",
        { media_kind: mediaKind.toUpperCase() },
      );
      if (!res.data?.data) throw new Error("No signature returned");
      sig = res.data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        throw new HotUploadError("signature", "Too many Hot posts at once — wait a few seconds and try again.");
      }
      throw new HotUploadError("signature", apiErrorMessage(err, "Couldn't start the upload"));
    }

    let result: CloudinaryUploadResult;
    try {
      result = await uploadToCloudinaryDirect(file, filename, sig, onProgress);
    } catch (err) {
      throw new HotUploadError("upload", err instanceof Error ? err.message : "Upload failed");
    }

    try {
      const res = await api.post<ApiEnvelope<RawHotPost>>("/hot-posts", {
        media_kind: mediaKind.toUpperCase(),
        hot_post_id: sig.hot_post_id,
        text,
        media_url: result.secure_url,
        public_id: result.public_id,
        resource_type: result.resource_type,
        bytes: result.bytes,
        duration: result.duration,
        width: result.width,
        height: result.height,
      });
      if (!res.data?.data) throw new Error("No post returned");
      const post = fromRaw(res.data.data);
      set((s) => ({ myPosts: [...s.myPosts, post] }));
      // The composer's own preview only ever showed a local blob URL, never
      // this real Cloudinary one — so without this, the FIRST time the
      // browser ever requests it is the moment EDeyHotViewer's own <img>/
      // <video> mounts, right after closing the composer. Starting the
      // fetch here instead gives it a head start during whatever time
      // passes between posting and actually tapping in to view it.
      preloadHotMedia([post]);
      return post;
    } catch (err) {
      throw new HotUploadError("create", apiErrorMessage(err, "Couldn't save that post"));
    }
  },

  deletePost: async (hotPostId) => {
    // Optimistic — removed from local state immediately, same as the rest
    // of this app's delete flows (GistCard's own handleDelete fires
    // onDeleted before the request even resolves). Nothing to roll back to
    // on failure here (no confirm-and-retry UX exists for this yet) beyond
    // what the error message itself communicates.
    set((s) => ({
      myPosts: s.myPosts.filter((p) => p.id !== hotPostId),
      feed: s.feed.map((person) => ({ ...person, posts: person.posts.filter((p) => p.id !== hotPostId) })).filter((p) => p.posts.length > 0),
    }));
    try {
      await api.delete(`/hot-posts/${encodeURIComponent(hotPostId)}`);
    } catch (err) {
      set({ error: apiErrorMessage(err, "Couldn't delete that post") });
      throw err;
    }
  },

  markSeen: (hotPostId) => {
    const alreadySeenLocally = get()
      .myPosts.concat(get().feed.flatMap((p) => p.posts))
      .find((p) => p.id === hotPostId)?.seen;
    if (alreadySeenLocally) return;

    set((s) => ({
      myPosts: s.myPosts.map((p) => (p.id === hotPostId ? { ...p, seen: true } : p)),
      feed: s.feed.map((person) => ({
        ...person,
        posts: person.posts.map((p) => (p.id === hotPostId ? { ...p, seen: true } : p)),
      })),
    }));
    if (!seenQueue.includes(hotPostId)) seenQueue.push(hotPostId);
  },

  flushSeen: async () => {
    if (seenQueue.length === 0) return;
    const ids = seenQueue;
    seenQueue = [];
    try {
      await api.post("/hot-posts/seen", { hot_post_ids: ids });
    } catch {
      // Best-effort — a seen-mark that didn't make it to the server just
      // means the NEXT fetchAll() re-derives `seen` from whatever the
      // server actually has, same self-healing shape gist_views' own
      // fire-and-forget view increments already rely on elsewhere in this
      // app. Never worth surfacing an error for.
    }
  },
}));

// HMR-safe module-level WS wiring — same "store the unsubscribe on
// globalThis, tear down the previous one before attaching a new one"
// pattern gistStore.ts's own feed.global/counts:updated subscriptions use,
// so a dev reload never stacks up duplicate listeners.
const wsHandles = globalThis as unknown as {
  __kamposHotCreatedUnsub?: () => void;
  __kamposHotDeletedUnsub?: () => void;
};
wsHandles.__kamposHotCreatedUnsub?.();
wsHandles.__kamposHotDeletedUnsub?.();

if (typeof window !== "undefined") {
  // A brand-new post from someone else doesn't carry author/tier info in
  // its WS payload (hot.controller.ts's broadcast is just the raw row —
  // adding the same author JOIN there purely for this event wasn't worth
  // it), so rather than fabricate a partial HotPerson entry, this just
  // re-runs the real feed fetch — debounced, so several posts arriving in
  // quick succession (several people posting around the same moment)
  // collapse into one refetch instead of one per event.
  wsHandles.__kamposHotCreatedUnsub = wsClient.subscribe("hot_post:created", () => {
    if (feedRefetchTimer) clearTimeout(feedRefetchTimer);
    feedRefetchTimer = setTimeout(() => {
      feedRefetchTimer = null;
      void useHotStore.getState().fetchAll();
    }, 1500);
  });

  // A delete DOES carry everything needed to remove it locally with no
  // refetch — including when this is the echo of your OWN delete arriving
  // back over the socket, where it's just a harmless no-op (already
  // removed locally by deletePost's own optimistic update).
  wsHandles.__kamposHotDeletedUnsub = wsClient.subscribe("hot_post:deleted", (payload) => {
    const p = payload as { hot_post_id?: string } | undefined;
    if (!p?.hot_post_id) return;
    const id = p.hot_post_id;
    useHotStore.setState((s) => ({
      myPosts: s.myPosts.filter((post) => post.id !== id),
      feed: s.feed
        .map((person) => ({ ...person, posts: person.posts.filter((post) => post.id !== id) }))
        .filter((person) => person.posts.length > 0),
    }));
  });
}
