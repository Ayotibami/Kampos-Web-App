"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { FeedGistCard } from "@/components/gist/FeedGistCard";
import { FeedGistCardSkeleton } from "@/components/gist/FeedGistCardSkeleton";
import { CommentPanel } from "@/components/comment/CommentPanel";

// Both are controlled dialogs (an `open` boolean, never actually gone from
// the tree) rather than conditionally mounted, so this doesn't defer *when*
// their code loads — it still starts as soon as the feed does — but it does
// pull compose (+ its own nested GiphyPicker/WebcamCapture) and the comment
// sheet out of the feed's own synchronous bundle into their own chunks,
// loaded in parallel instead of blocking the feed's initial parse/hydrate.
// ssr:false is correct for both — pure interactive chrome, no content a
// crawler would ever need from the server-rendered HTML.
const CreateGistSheet = dynamic(
  () => import("@/components/gist/CreateGistSheet").then((m) => m.CreateGistSheet),
  { ssr: false },
);
const CommentSheet = dynamic(
  () => import("@/components/comment/CommentSheet").then((m) => m.CommentSheet),
  { ssr: false },
);
import { Illustration } from "@/components/brand/illustrations";
import { Avatar } from "@/components/ui/Avatar";
import { Wordmark } from "@/components/brand/Wordmark";
import { Plus, RefreshCw, X, AdminsIconFill } from "@/components/ui/icons";
import { FloatingComposeButton } from "@/components/gist/FloatingComposeButton";
import { PullIndicator, usePullToRefresh } from "@/components/ui/PullToRefresh";
import { AnimatePresence } from "framer-motion";
import { useGistStore, getFreshFeedSnapshot, patchGistPoll } from "@/stores/gistStore";
import { useCommentStore } from "@/stores/commentStore";
import { useAuthStore, useIsAdmin } from "@/stores/authStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { timeAgo } from "@/lib/format";
import type { Gist } from "@/types";

// "Gist" | "Amebo" | a campus_tag (one of the trending-school pills) — a
// plain string rather than a richer union so the existing tab-as-string
// plumbing (useState, the tabButtons render loop) didn't need reshaping;
// real campus tags are lowercase abbreviations ("unilag", "oau") so they
// never collide with the two fixed, capitalized tab names.
type Tab = string;

// Compose-trigger animation timing. The "notice me" pulse used to run on its
// own faster interval, independent of the prompt text changing — now it
// A random one of these gets typed out as the compose sheet's own
// placeholder (see CreateGistSheet) the moment it opens — picked fresh each
// time, not rotated continuously in the background like before (nothing
// was left on-screen to show that rotation once the trigger shrank down to
// a bare plus button).
const PROMPTS = [
  "Oya gist us",
  "Feel free to rant",
  "Wetin dey your mind?",
  "Give us hot gist",
  "Wetin dey sup",
  "Oya we are listening",
  "Yarn some matter for us",
  "What's happening on campus?",
  "Tell us a story",
  "Any random gist?",
  "Any departmental gist",
  "Wetin dey sup for school",
  "Oya banter anybody!",
];

let lastPromptIndex = -1;
function pickRandomPrompt(): string {
  let idx = Math.floor(Math.random() * PROMPTS.length);
  if (PROMPTS.length > 1) {
    while (idx === lastPromptIndex)
      idx = Math.floor(Math.random() * PROMPTS.length);
  }
  lastPromptIndex = idx;
  return PROMPTS[idx];
}

// Exported so loading.tsx (the route-level Suspense fallback shown before
// this component ever mounts) can render the exact same skeleton stack
// instead of drifting out of sync with it, the way it did when the feed
// was still the old single-card swipe stack.
export const SKELETON_VARIANTS = ["media", "text", "hero", "text"] as const;

/** `CommentPanel` itself only ever shows a bare "X Comments" count — fine on
 * the gist page, where the gist it's about is the whole screen right next to
 * it, but not enough here, where the panel stays put while several different
 * gists scroll past on the left. Sits above it with just enough of the
 * active gist to make it obvious what's being commented on. Same component
 * ProfileView already has (not exported from there, so duplicated here
 * rather than touching that file). */
function ActiveGistStrip({
  gist,
  onClose,
}: {
  gist: Gist | undefined;
  onClose: () => void;
}) {
  if (!gist) return null;
  const text = gist.gist_text?.trim();
  const preview = text
    ? text.length > 90
      ? `${text.slice(0, 90).trimEnd()}…`
      : text
    : gist.media?.[0]?.media_type?.toLowerCase().includes("video")
      ? "Video"
      : gist.media?.length
        ? "Photo"
        : "";
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-brand/[0.06] px-5 py-3 dark:border-white/10 dark:bg-brand-ink/60">
      <div className="min-w-0">
        <p className="font-nunito text-[10px] font-bold uppercase tracking-wide text-brand">
          Commenting on
        </p>
        <p className="mt-0.5 line-clamp-2 font-nunito text-xs text-ink dark:text-white/90">
          {preview}
        </p>
        <p className="mt-0.5 font-nunito text-[11px] text-faint">
          {timeAgo(gist.created_at)}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close comments"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function FeedContent({ initialGists }: { initialGists: Gist[] }) {
  const listGists = useGistStore((s) => s.list);
  const primeFromServer = useGistStore((s) => s.primeFromServer);
  const prefetchComments = useCommentStore((s) => s.prefetchBatch);
  const myAvitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) =>
      (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as
        | string
        | undefined) ?? null,
  );
  const isMobile = useIsMobile();
  const isAdmin = useIsAdmin();

  // Captured once, at mount, from whatever gistStore.feedSnapshot holds —
  // see that field's own docstring for why this exists at all (surviving a
  // full unmount/remount, e.g. tapping into a profile and back, is the
  // whole point). `useState`'s lazy-initializer form (a function, not a
  // value) guarantees this reads the store exactly once, not on every
  // render — every piece of state below that restores from it needs to see
  // the SAME snapshot, not each independently re-read a store that a later
  // save (see the effect further down) may have already overwritten.
  const [restoredSnapshot] = useState(getFreshFeedSnapshot);

  // Which tab was active is part of the snapshot too, not just which gist —
  // restoring the gists themselves while silently defaulting back to "Gist"
  // would be visibly wrong for anyone who'd switched to Amebo or a school
  // pill before tapping away. Falls back to "Gist" exactly like a genuinely
  // fresh visit does when there's nothing (or nothing fresh enough) to
  // restore.
  const [tab, setTab] = useState<Tab>(() => {
    if (!restoredSnapshot) return "Gist";
    if (restoredSnapshot.feedMode === "amebo") return "Amebo";
    if (restoredSnapshot.feedMode === "school" && restoredSnapshot.schoolTag) return restoredSnapshot.schoolTag;
    return "Gist";
  });

  // Start with server-fetched gists (if any) — no skeleton on first render.
  // Only fall back to a client-side fetch if the server couldn't deliver
  // (backend was down during SSR). A fresh-enough restoredSnapshot wins
  // over both: it's a truer picture of "what this exact browser tab was
  // just showing" than a brand new SSR fetch, which has no idea you were
  // ever here before and would otherwise reset you to the very top.
  const [gists, setGists] = useState<Gist[]>(() => restoredSnapshot?.gists ?? initialGists);
  const [loading, setLoading] = useState(() => (restoredSnapshot ? false : initialGists.length === 0));
  // Distinct from a genuinely empty feed — an empty list because the fetch
  // itself failed (backend down, network hiccup) needs its own "something
  // went wrong, retry" UI, not the same "be the first to gist" copy a truly
  // empty feed shows. Conflating the two used to show "no gist dey here
  // yet" even when the database plainly had gists, purely because the one
  // fetch that happened to run failed.
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Sample/demo data has no real backend cursor to page through — pagination
  // only makes sense once the live API actually returned something.
  // Once the backend's cursor pagination genuinely runs out (an empty page
  // back), stop asking — otherwise sitting near the end of the feed would
  // keep re-firing the same exhausted request indefinitely.
  const [exhausted, setExhausted] = useState(false);
  // See load()'s own comment for the full race this guards against —
  // bumped at the start of every load(), read (not bumped) by loadMore().
  const requestGenRef = useRef(0);
  const [showCreate, setShowCreate] = useState(false);
  // A fresh random prompt, picked the moment the compose button is
  // clicked (see pickRandomPrompt) — CreateGistSheet does its own typing
  // animation with it now, not this component.
  const [composePlaceholder, setComposePlaceholder] = useState("");
  const [showComposeHint, setShowComposeHint] = useState(false);

  const dismissComposeHint = () => {
    setShowComposeHint(false);
    try {
      window.localStorage.setItem("kampos-compose-hint-seen", "true");
    } catch {
      /* best-effort */
    }
  };

  // One-time coach mark teaching that the compose row is tappable — same
  // pattern as the swipe hint: shown once ever (localStorage-flagged), and
  // dismissed the moment someone actually opens the composer, or after a
  // short timeout either way (this one's a discovery aid, not essential, so
  // it doesn't need to block on a real interaction like the swipe hint does).
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem("kampos-compose-hint-seen") === "true";
    } catch {
      /* storage unavailable — just don't show the hint */
    }
    if (seen) return;
    setShowComposeHint(true);
    const timer = window.setTimeout(() => dismissComposeHint(), 5000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Gist" = your own school's students + every non-student poster.
  // "Amebo" = everyone, no campus filtering. Any other tab value is one of
  // the trending-school pills — a specific OTHER campus's students only.
  // The backend derives your own campus itself from your session for
  // "gist" — this is just telling it which rule to apply plus, for
  // "school", which campus (see gist.controller.ts's list handler).
  const isSchoolTab = tab !== "Gist" && tab !== "Amebo";
  const feedMode = tab === "Amebo" ? "amebo" : isSchoolTab ? "school" : "gist";
  const trendingSchools = useGistStore((s) => s.trendingSchools);
  const fetchTrendingSchools = useGistStore((s) => s.fetchTrendingSchools);

  // Trending schools refresh independently of the currently-selected tab —
  // fetched on mount and re-polled every 5 minutes so the row reflects the
  // backend's own ~20-minute cache reasonably promptly without hammering
  // it. A school pill can silently vanish between polls (no minimum-
  // activity floor, by design — see the backend's getTrendingSchools); if
  // that happens to be the one currently selected, fall back to Gist
  // rather than leaving the feed showing a school with no matching pill
  // left to indicate it. This can only ever fire once a school tab has
  // actually been selected, which itself requires trendingSchools to have
  // already been non-empty — so it never mis-fires against the initial []
  // before the first fetch resolves.
  useEffect(() => {
    void fetchTrendingSchools();
    const interval = window.setInterval(() => void fetchTrendingSchools(), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isSchoolTab && !trendingSchools.some((s) => s.campus_tag === tab)) {
      setTab("Gist");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendingSchools]);

  // The actual scrollable element — tabs/header above it stay fixed in
  // place, everything below scrolls inside this div. Pull-to-refresh's
  // touch handlers bind here too (see atTop below), and the "load more"
  // sentinel sits at its bottom.
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (opts?: { resetToTop?: boolean }) => {
    // Bumped synchronously (before the first await) every time a fresh
    // fetch starts — tab switch, pull-to-refresh, retry, initial load, all
    // of it. loadMore() below captures whichever value is current when IT
    // starts, and refuses to apply its own results if this has moved on by
    // the time it resolves. Without this, a loadMore() from a tab you've
    // since switched away from could resolve after the new tab's own load()
    // and append its stale results onto the new feed via setGists's
    // functional updater.
    const gen = ++requestGenRef.current;
    // Only show loading skeleton if the feed is actually empty — list()
    // always asks the server directly when online now, no cache in the way.
    if (gists.length === 0) setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 30, feed_mode: feedMode };
      if (isSchoolTab) params.school = tab;
      const data = await listGists(params);
      if (gen !== requestGenRef.current) return; // superseded — discard
      setGists(data);
      setExhausted(false);
      setLoadError(false);
      void prefetchComments(data.map((g) => g.gist_id));
      // A vertical scroll back to the top, not GistStack's old index
      // reconciliation — there's no "position" concept left to restore
      // here, just the literal scroll offset.
      if (opts?.resetToTop) scrollRef.current?.scrollTo({ top: 0 });
    } catch {
      // Backend unreachable/request failed — leave whatever gists were
      // already loaded in place (don't wipe a working feed over a single
      // failed refresh) but flag it so an empty list renders as "failed to
      // load, retry" instead of silently passing for "no gists exist".
      if (gen === requestGenRef.current) setLoadError(true);
    } finally {
      if (gen === requestGenRef.current) setLoading(false);
    }
  }, [listGists, prefetchComments, gists.length, feedMode, isSchoolTab, tab]);

  // Switching tabs changes which pool of gists the feed draws from, so the
  // whole list has to start over — old-tab gists left on screen while the
  // new tab's data loads would flash the wrong content under the newly
  // active pill. Skipped when `tab` hasn't actually changed from what it
  // was the last time this effect ran (covers both the genuine first mount
  // AND React Strict Mode's dev-only mount→cleanup→remount replay).
  const prevTabRef = useRef(tab);
  useEffect(() => {
    if (prevTabRef.current === tab) return;
    prevTabRef.current = tab;
    setGists([]);
    setExhausted(false);
    setLoadError(false);
    setLoading(true);
    void load({ resetToTop: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Pull-to-refresh is only armed while actually scrolled to the top of the
  // list — the real equivalent of the old swipe-stack's "only at the first
  // card" gate, now expressed as a real scroll position instead of an
  // index. Below the top, a downward drag is just normal scroll-up, not a
  // refresh gesture. Reads scrollRef directly, fresh, at the moment each
  // touch starts — see usePullToRefresh's own doc for why that's the
  // reliable way to check this, not a separately-computed boolean from
  // its own scroll listener (which is what used to live here).
  const { pull, state, containerRef: pullToRefreshRef } = usePullToRefresh<HTMLDivElement>(
    () => load({ resetToTop: true }),
    scrollRef,
  );

  // Prefetch comments for whichever gists are actually on screen at mount,
  // and — only when there was nothing fresh enough to restore — seed the
  // store from SSR data the same way this always has.
  useEffect(() => {
    if (restoredSnapshot) {
      void prefetchComments(restoredSnapshot.gists.map((g) => g.gist_id));
      return;
    }
    if (initialGists.length > 0) {
      void prefetchComments(initialGists.map((g) => g.gist_id));
      primeFromServer(initialGists, { limit: 30 });
    } else {
      // SSR delivered nothing — either the backend was unreachable during
      // SSR, or the feed is genuinely empty. Either way, fall back to a
      // real client-side fetch so the skeleton actually resolves instead
      // of hanging forever.
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which gist a card's own comment button last targeted — desktop's
  // CommentPanel shows whichever one this is; on mobile it's just who
  // CommentSheet opens for. Same pattern ProfileView already uses for its
  // own gist list, not tied to "whichever card happens to be on screen"
  // the way the old swipe-stack's `current` was, since every card in a
  // scrolling list can be on screen at once.
  const [activeGistId, setActiveGistId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Defaults to the first gist once the list loads, so the panel isn't
  // referring to nothing before anyone's tapped a comment button — derived
  // during render (the documented pattern for this), not an effect; the
  // guard makes it safe to call unconditionally since it only ever fires
  // once, before the very first gist has loaded.
  if (activeGistId === null && gists.length > 0) {
    setActiveGistId(gists[0].gist_id);
  }
  const activeGist = gists.find((g) => g.gist_id === activeGistId);

  // Desktop-only scrollspy — keeps activeGistId (and so the comment panel)
  // in sync with whichever card is actually centered on screen as the list
  // scrolls, not just whichever one a comment button was last tapped on.
  // Same pattern ProfileView already uses for its own gist list (this was
  // meant to be ported over when the feed became a scrolling list, and
  // wasn't — a real gap, not a deliberate omission). `rootMargin: "-50%
  // 0px -50% 0px"` is the standard scrollspy trick: it shrinks the
  // observer's root down to a single line across the exact middle of the
  // viewport, so `isIntersecting` only flips true for whichever card is
  // currently crossing that line. Mobile skips this entirely — comments
  // open in a modal sheet there, not a side panel, so there's nothing for
  // scroll position to keep in sync with.
  useEffect(() => {
    if (isMobile) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-gist-id");
            if (id) setActiveGistId(id);
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [gists, isMobile]);

  // Closed by default on mobile (there it's the sheet, a deliberate modal
  // action, not a passive side panel) — but open by default on desktop,
  // where the panel just sits there with real screen space to spare, and
  // making someone click a comment button first before they can even see
  // that space being used is friction for nothing. Checked directly via
  // matchMedia in a layout effect (same technique useIsMobile itself uses,
  // see its own doc) rather than reading the `isMobile` state — that state
  // always starts false on the very first render, including on an actual
  // phone, and only self-corrects a moment later; trusting it here would
  // open the panel on mobile for one frame before snapping shut. The ref
  // guard is so this only ever runs once, on mount — resizing across the
  // breakpoint afterward shouldn't override a viewer's own manual
  // open/close.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const didSetDefaultCommentsOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (didSetDefaultCommentsOpenRef.current) return;
    didSetDefaultCommentsOpenRef.current = true;
    if (!window.matchMedia("(max-width: 767px)").matches) {
      setCommentsOpen(true);
    }
  }, []);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const handleToggleComments = (gistId: string) => {
    setActiveGistId(gistId);
    if (isMobile) {
      setShowCommentSheet(true);
      return;
    }
    if (commentsOpen && activeGistId === gistId) {
      setCommentsOpen(false);
    } else {
      setCommentsOpen(true);
    }
  };

  // Restores the exact scroll position a fresh-enough snapshot remembered —
  // once, on mount, not smoothly (this is a restore, not a user-initiated
  // scroll). Falls through to nothing (stays at the top) if the remembered
  // gist isn't in the restored list for some reason.
  const didRestoreScrollRef = useRef(false);
  useEffect(() => {
    if (didRestoreScrollRef.current) return;
    didRestoreScrollRef.current = true;
    if (!restoredSnapshot?.currentGistId) return;
    const el = cardRefs.current.get(restoredSnapshot.currentGistId);
    el?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps gistStore's feedSnapshot current so the NEXT mount (e.g. tapping
  // back after checking a profile) can restore straight to this exact spot
  // instead of resetting to the top — see that field's own docstring for
  // the full reasoning. `activeGistId` is the closest equivalent the new
  // vertical list has to the old swipe-stack's `current` — it only updates
  // when a comment button is actually tapped rather than continuously as
  // you scroll, same granularity ProfileView's own identical snapshot-free
  // use of activeGistId already accepts.
  useEffect(() => {
    if (!activeGistId) return;
    useGistStore.getState().saveFeedSnapshot({
      gists,
      currentGistId: activeGistId,
      feedMode,
      schoolTag: isSchoolTab ? tab : null,
    });
  }, [activeGistId, gists, feedMode, isSchoolTab, tab]);

  // A background offline-queue flush (see OfflineSync, mounted globally)
  // just landed one or more real gists on the server — patch them into the
  // visible feed so they stop showing as local-only optimistic entries.
  useEffect(() => {
    const onSynced = (e: Event) => {
      const detail = (
        e as CustomEvent<
          { syncedCreates?: { oldId: string; newId: string; gist?: Gist }[]; deletedGistIds?: string[] } | undefined
        >
      ).detail;
      if (!detail || (!detail.syncedCreates?.length && !detail.deletedGistIds?.length)) {
        return;
      }
      const byOldId = new Map((detail.syncedCreates ?? []).map((c) => [c.oldId, c]));
      const deleted = new Set(detail.deletedGistIds ?? []);
      setGists((prev) =>
        prev
          .filter((g) => !deleted.has(g.gist_id))
          .map((g) => {
            const synced = byOldId.get(g.gist_id);
            if (!synced) return g;
            return synced.gist ?? { ...g, gist_id: synced.newId };
          }),
      );
    };
    window.addEventListener("kampos:gists-synced", onSynced);
    return () => window.removeEventListener("kampos:gists-synced", onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live counts (reactions/comments/views ticking up from other people's
  // activity, not just your own) and live moderation removal.
  useEffect(() => {
    const onCounts = (e: Event) => {
      const { gist_id, counts } = (e as CustomEvent<{ gist_id: string; counts: Partial<Gist["counts"]> }>).detail;
      setGists((prev) =>
        prev.map((g) => (g.gist_id === gist_id ? { ...g, counts: { ...g.counts, ...counts } as Gist["counts"] } : g)),
      );
    };
    const onRejected = (e: Event) => {
      const { gist_id } = (e as CustomEvent<{ gist_id: string }>).detail;
      setGists((prev) => prev.filter((g) => g.gist_id !== gist_id));
    };
    // Someone ELSE voting on a poll gist already on screen — see
    // gistStore's own poll:voted WS subscription for the full reasoning.
    // Only patches `options` (live counts), never `my_vote_option_id` —
    // a broadcast has no single "viewer" to compute that for, so this
    // viewer's own vote (if any) stays exactly as PollBlock already has it.
    const onPoll = (e: Event) => {
      const { gist_id, options } = (
        e as CustomEvent<{ gist_id: string; options: NonNullable<Gist["poll"]>["options"] }>
      ).detail;
      setGists((prev) => prev.map((g) => patchGistPoll(g, gist_id, (poll) => ({ ...poll, options }))));
    };
    window.addEventListener("kampos:gist-counts-updated", onCounts);
    window.addEventListener("kampos:gist-rejected", onRejected);
    window.addEventListener("kampos:gist-poll-updated", onPoll);
    return () => {
      window.removeEventListener("kampos:gist-counts-updated", onCounts);
      window.removeEventListener("kampos:gist-rejected", onRejected);
      window.removeEventListener("kampos:gist-poll-updated", onPoll);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || gists.length === 0) return;
    // The feed is ranked, not sorted by created_at alone, so the last
    // gist's own id isn't enough to resume from — _feed_cursor is the
    // opaque token that actually encodes its position in that ranking.
    const cursor = gists[gists.length - 1]?._feed_cursor;
    if (!cursor) return;
    const gen = requestGenRef.current;
    setLoadingMore(true);
    try {
      const params: Record<string, unknown> = { cursor, limit: 30, feed_mode: feedMode };
      if (isSchoolTab) params.school = tab;
      const more = await listGists(params);
      if (gen !== requestGenRef.current) return; // superseded — discard
      const seen = new Set(gists.map((g) => g.gist_id));
      const fresh = more.filter((g) => !seen.has(g.gist_id));
      if (fresh.length) {
        setGists((prev) => [...prev, ...fresh]);
        void prefetchComments(fresh.map((g) => g.gist_id));
      } else {
        setExhausted(true);
      }
    } catch {
      /* best-effort — the near-end trigger will just fire again on the next approach */
    } finally {
      setLoadingMore(false);
    }
  }, [exhausted, gists, listGists, loadingMore, prefetchComments, feedMode, isSchoolTab, tab]);

  // Auto-fetches the next page as the list scrolls near its end — same
  // IntersectionObserver-on-a-sentinel pattern ProfileView already uses,
  // replacing the old swipe-stack's proximity-based onNearEnd.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // YouTube-style chip row: each filter is its own independent pill (not a
  // shared sliding-indicator track), so adding a 3rd, 6th, or 10th tab later
  // (My Major, Kreators, Trending, ...) is just another chip in the scroll —
  // the pattern doesn't strain or need rethinking as the set grows, unlike a
  // segmented control which only really reads well at 2-3 items. Gist/Amebo
  // are always present; the trending-school pills after them are dynamic —
  // up to 3, fewer (or none) if fewer schools currently qualify, never
  // padded (see gistStore's fetchTrendingSchools/the backend's
  // getTrendingSchools for how "trending" is computed).
  const fixedTabs: Array<{ id: string; label: string }> = [
    { id: "Gist", label: "Gist" },
    { id: "Amebo", label: "Amebo" },
  ];
  const schoolTabs = trendingSchools.map((s) => ({ id: s.campus_tag, label: s.campus_tag.toUpperCase() }));
  const tabButtons = [
    ...fixedTabs.map((t) => ({ ...t, isSchool: false })),
    ...schoolTabs.map((t) => ({ ...t, isSchool: true })),
  ].map(({ id, label, isSchool }) => {
    const isActive = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={`inline-flex min-w-[60px] shrink-0 items-center justify-center rounded-full px-4 py-1.5 text-center font-nunito text-[14px] transition active:scale-95 ${
          isSchool ? "tracking-wide" : ""
        } ${
          isActive
            ? "bg-brand text-white font-semibold shadow-sm shadow-brand/30"
            : "bg-brand/[0.06] text-faint font-medium ring-1 ring-line/50 hover:bg-brand/10 hover:text-brand"
        }`}
      >
        {label}
      </button>
    );
  });

  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden">
        {/* Center Feed */}
        <div
          ref={pullToRefreshRef}
          className="relative flex h-full min-w-0 flex-1 flex-col bg-brand/[0.04] dark:bg-brand/[0.07]"
          // Pull-to-refresh listens on the whole feed column (header
          // included), not just the scrollable list below it. A real
          // pull-down gesture is almost always started right near the top
          // of the visible screen, which is exactly where the sticky
          // header sits — binding only to the list below it (the original
          // approach) meant a gesture that started ON or over the header,
          // before the finger even reached the list, was silently
          // dropped: touchstart never fired, so startY/pullingRef never
          // got set, and the rest of the drag did nothing at all. Safe to
          // attach this broadly: the gesture is a pure coordinate-based
          // state machine (just clientY) gated on `atTop`/a real downward
          // delta before it does anything visible, and only ever calls
          // preventDefault once it's already sure this is a genuine pull
          // (see usePullToRefresh's own doc) — an ordinary tap on the
          // avatar, a tab pill, or anything else in the header still works
          // exactly as before.
        >
          {/* Header — logo + account icons on their own row (app chrome);
              feed tabs get their own row underneath (X-style: "which feed am
              I looking at" reads as content, not global nav), left-aligned
              so it has room to grow rightward as more filters get added. */}
          <header className="sticky top-0 z-20 w-full shrink-0 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto grid max-w-[740px] grid-cols-[1fr_auto_1fr] items-center px-4 py-2 sm:px-6 md:py-2.5">
              {/* Profile avatar — the account entry point, anchored at the
                  outer left edge (settings/theme toggle live on the profile
                  page now, see below). Plus button balances it on the
                  opposite edge instead of the two sharing one side, so the
                  wordmark actually reads as centered between two anchors
                  rather than centered against a dead spacer.
                  Avatar link is desktop-only (`hidden md:flex`) — mobile
                  has its own profile entry point now (the "You" tab in
                  MobileTabBar), and desktop has no bottom nav at all, so
                  this stays the only way to reach your profile there. The
                  admin link right after it stays visible on every size —
                  mobile still needs its own way into Village People, and
                  MobileTabBar has no admin stop. */}
              <div className="flex items-center gap-2 justify-self-start">
                <Link
                  href={myAvitag ? `/${myAvitag}` : "/feed"}
                  aria-label="Your profile"
                  className="hidden h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-line transition hover:ring-brand md:flex"
                >
                  <Avatar src={myImageUrl} />
                </Link>
                {/* Village People entry point — only ever rendered for an
                    idiot/king account (useIsAdmin, same client-side role
                    check VillagePeopleRail itself already gates its own
                    "Admins" link on), so this is invisible chrome for
                    every regular student. Sits right next to the avatar
                    rather than in Settings — the admin team needs this
                    often enough through the day that one more tap in a
                    settings menu would be real friction. */}
                {isAdmin && (
                  <Link
                    href="/villagepeople"
                    aria-label="Village People admin panel"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95"
                  >
                    <AdminsIconFill className="h-4 w-4" />
                  </Link>
                )}
              </div>

              <Wordmark
                accentClassName="text-brand"
                className="justify-self-center text-lg sm:text-xl"
              />

              {/* Compose trigger — desktop only now (`hidden md:flex`); on
                  mobile this whole slot (button + its one-time coach mark
                  below) goes away entirely in favor of FloatingComposeButton,
                  a bottom-right FAB with its own recurring idle animation —
                  see that component's own doc for why a fixed corner button
                  needs that and a header button never did. Squeezed onto the
                  wordmark's row (which had height to spare) rather than its
                  own row, on desktop where it still renders. */}
              <div className="relative hidden shrink-0 justify-self-end md:flex">
                <button
                  type="button"
                  onClick={() => {
                    setComposePlaceholder(pickRandomPrompt());
                    setShowCreate(true);
                    dismissComposeHint();
                  }}
                  aria-label="Create a gist"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {/* One-time coach mark: teaches that this button is tappable. */}
                <AnimatePresence>
                  {showComposeHint && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="absolute right-0 top-full z-20 mt-1.5 flex flex-col items-end"
                    >
                      <span
                        aria-hidden
                        className="mr-3 h-2 w-2 rotate-45 bg-brand-ink"
                      />
                      <span className="-mt-1 whitespace-nowrap rounded-full bg-brand-ink px-3 py-1.5 font-nunito text-xs font-medium text-white shadow-lg">
                        Tap here make you gist!
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mx-auto flex max-w-[740px] items-center px-4 pb-2.5 pt-1 sm:px-6">
              <div className="inline-flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
                {tabButtons}
              </div>
            </div>
          </header>

          {/* Feed body — a real vertical scroll container (same shape the
              profile page's own gist list already uses), doodle tiled
              across the whole area behind it. Tiled rather than stretched:
              the source art is a tall 360×800 scattered doodle, not a
              seamless single-image cover, so tiling is what lets it
              genuinely fill a wide area without cropping most of it away. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 opacity-100 dark:opacity-90 dark:invert"
              style={{
                backgroundImage: "url('/brand/doodles.svg')",
                backgroundRepeat: "repeat",
                backgroundSize: "280px auto",
              }}
            />

            {loading ? (
              <div className="relative z-10 flex min-h-0 flex-1 justify-center overflow-y-auto px-4 pb-8 pt-3 sm:pt-4">
                <div className="w-full max-w-[740px] space-y-3">
                  {SKELETON_VARIANTS.map((variant, i) => (
                    <FeedGistCardSkeleton key={i} variant={variant} />
                  ))}
                </div>
              </div>
            ) : gists.length ? (
              <div
                ref={scrollRef}
                // overscroll-y-contain: this is the actual scroll container
                // that hits its own real top boundary as you pull down —
                // `overscroll-behavior: none` on html/body (globals.css's
                // `feed-locked` rule) only stops the outer PAGE from
                // bouncing/native-refreshing, it does nothing for THIS
                // nested container's own overscroll once IT runs out of
                // room to scroll. Without this, a real phone's browser can
                // still intercept the drag right at this div's own
                // boundary — its own rubber-band bounce, or (worse) letting
                // the gesture chain up to the page after all — competing
                // with (or entirely stealing) the custom pull-to-refresh
                // logic below. `contain` stops it exactly at this box's
                // edge without disabling scroll bounce everywhere.
                className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain"
              >
                <PullIndicator pull={pull} state={state} />
                <div className="flex flex-1 justify-center px-4 pb-24 pt-3 sm:pt-4 md:pb-8">
                  <div className="w-full max-w-[740px]">
                    <ul className="flex flex-col gap-3">
                      {gists.map((g) => (
                        <li
                          key={g.gist_id}
                          data-gist-id={g.gist_id}
                          ref={(el) => {
                            if (el) cardRefs.current.set(g.gist_id, el);
                            else cardRefs.current.delete(g.gist_id);
                          }}
                        >
                          <FeedGistCard
                            gist={g}
                            showCampusTag={feedMode === "amebo"}
                            active={commentsOpen && g.gist_id === activeGistId}
                            onToggleComments={() => handleToggleComments(g.gist_id)}
                            onDeleted={(gistId) =>
                              setGists((prev) => prev.filter((gg) => gg.gist_id !== gistId))
                            }
                            onEdited={(fresh) =>
                              setGists((prev) =>
                                prev.map((gg) => (gg.gist_id === fresh.gist_id ? fresh : gg)),
                              )
                            }
                            onReposted={(fresh) =>
                              setGists((prev) => {
                                // Same "land after the active gist, not
                                // always the front" placement as the main
                                // composer's own onPosted above.
                                const idx = activeGistId
                                  ? prev.findIndex((gg) => gg.gist_id === activeGistId)
                                  : -1;
                                if (idx === -1) return [fresh, ...prev];
                                return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
                              })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                    {/* Invisible trigger for the next page — see the
                        IntersectionObserver effect above. Not shown once
                        exhausted, so there's nothing left to ever re-trigger it. */}
                    {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
                    {loadingMore && (
                      <div className="mt-3 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <FeedGistCardSkeleton key={i} variant="text" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : loadError ? (
              <div className="relative z-10 flex flex-1 w-full flex-col items-center justify-center gap-3 text-center px-6">
                <RefreshCw className="h-10 w-10 text-muted" />
                <p className="font-nunito text-sm text-muted">
                  Abeg we no fit load the gists — check your connection.
                </p>
                <button
                  type="button"
                  onClick={() => load()}
                  className="rounded-full bg-brand px-4 py-2 font-nunito text-sm font-semibold text-white transition hover:bg-brand-dark"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="relative z-10 flex flex-1 w-full flex-col items-center justify-center gap-3 text-center">
                <Illustration
                  name="Kappymagnifyingglass"
                  className="h-40 w-auto"
                />
                <p className="font-nunito text-sm text-muted">
                  No gist dey here yet. Be the first to gist!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right pane — comments. Closed by default; a card's own comment
            button opens it (see handleToggleComments), same as the profile
            page. Desktop-only (hidden below md) and only rendered while
            actually open, so the center column reclaims the full width the
            moment it's closed instead of permanently giving up 360px. */}
        {commentsOpen && !loading && !loadError && gists.length > 0 && (
          <div className="hidden h-full w-[360px] shrink-0 md:block">
            <div className="flex h-full flex-col bg-surface">
              <ActiveGistStrip gist={activeGist} onClose={() => setCommentsOpen(false)} />
              <div className="min-h-0 flex-1">
                <CommentPanel gist={activeGist} />
              </div>
            </div>
          </div>
        )}
      </div>

      <FloatingComposeButton
        onClick={() => {
          setComposePlaceholder(pickRandomPrompt());
          setShowCreate(true);
          dismissComposeHint();
        }}
      />

      <CreateGistSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onPosted={(fresh) =>
          setGists((prev) => {
            // Land right after whichever gist the comment panel/sheet is
            // currently pointed at, not always the end of a list that could
            // be hundreds deep. Falls back to the front of the list on the
            // rare chance nothing's active yet (e.g. an empty feed).
            const idx = activeGistId
              ? prev.findIndex((g) => g.gist_id === activeGistId)
              : -1;
            if (idx === -1) return [fresh, ...prev];
            return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
          })
        }
        placeholder={composePlaceholder}
      />
      <CommentSheet
        open={showCommentSheet}
        onClose={() => setShowCommentSheet(false)}
        gist={activeGist}
        autoFocusInput={false}
      />
    </AppShell>
  );
}
