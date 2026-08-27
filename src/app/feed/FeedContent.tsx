"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { GistStack } from "@/components/gist/GistStack";
import { GistCardSkeleton } from "@/components/gist/GistCardSkeleton";
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
import { Plus, RefreshCw, CommentIconFill } from "@/components/ui/icons";
import { NewGistsPill } from "@/components/gist/NewGistsPill";
import { PullIndicator, usePullToRefresh } from "@/components/ui/PullToRefresh";
import { AnimatePresence } from "framer-motion";
import { useGistStore, getFreshFeedSnapshot } from "@/stores/gistStore";
import { useCommentStore } from "@/stores/commentStore";
import { useAuthStore } from "@/stores/authStore";
import { compactNumber } from "@/lib/format";
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
  // keep re-firing the same exhausted request indefinitely (loadMore's own
  // identity changes each time loadingMore toggles, which re-triggers
  // GistStack's near-end effect even though nothing about the list moved).
  const [exhausted, setExhausted] = useState(false);
  // See load()'s own comment for the full race this guards against —
  // bumped at the start of every load(), read (not bumped) by loadMore().
  const requestGenRef = useRef(0);
  const [current, setCurrent] = useState<Gist>();
  // Where GistStack should open — the restored gist's position in the
  // restored list, not always the front. Computed once, at mount, same as
  // everything else derived from restoredSnapshot; GistStack itself only
  // ever reads its own initialIndex prop once (see its own docstring), so
  // this never needs to be reactive after the first render.
  const [initialGistIndex] = useState(() => {
    if (!restoredSnapshot) return 0;
    const idx = restoredSnapshot.gists.findIndex((g) => g.gist_id === restoredSnapshot.currentGistId);
    return idx >= 0 ? idx : 0;
  });
  // Bumped whenever a pull-to-refresh completes — GistStack watches this and
  // snaps back to the first card (see its own docstring for why a plain
  // list swap isn't enough on its own).
  const [resetToTopSignal, setResetToTopSignal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  // The icon+count trigger just opens the sheet to look — it shouldn't pop
  // the keyboard open. The pill trigger is the one meant for typing, so
  // that one still autofocuses. Tracked per-open rather than hardcoded on
  // CommentSheet since the same sheet now has two different doors in.
  const [commentSheetAutoFocus, setCommentSheetAutoFocus] = useState(true);
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
  const setActiveFeedMode = useGistStore((s) => s.setActiveFeedMode);
  const trendingSchools = useGistStore((s) => s.trendingSchools);
  const fetchTrendingSchools = useGistStore((s) => s.fetchTrendingSchools);

  // Keeps gistStore's own copy of "which tab is active" current — that
  // store-level flag exists purely for the module-level feed.global/
  // GIST_APPROVED WS handler (see its own comment), which has no way to
  // read this component's local `tab` state directly. Deliberately not
  // skipped on mount like the tab-switch effect below — the store needs
  // the real value from the very first render, not just from the second
  // tab switch onward.
  useEffect(() => {
    setActiveFeedMode(feedMode, isSchoolTab ? tab : null);
  }, [feedMode, isSchoolTab, tab, setActiveFeedMode]);

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

  const load = useCallback(async (opts?: { resetToTop?: boolean }) => {
    // Bumped synchronously (before the first await) every time a fresh
    // fetch starts — tab switch, pull-to-refresh, retry, initial load, all
    // of it. loadMore() below captures whichever value is current when IT
    // starts, and refuses to apply its own results if this has moved on by
    // the time it resolves. Without this, a loadMore() from a tab you've
    // since switched away from could resolve after the new tab's own load()
    // and append its stale results onto the new feed via setGists's
    // functional updater — invisible with a large feed (near-end rarely
    // fires early enough to race a tab switch), but a 3-gist school feed
    // trips onNearEnd (GistStack, NEAR_END_THRESHOLD=5) on literally the
    // first card, making the race trivial to hit by switching tabs quickly.
    // A gist visible on more than one tab (e.g. also shows on Amebo) would
    // then land twice in the same array — the exact "two children with the
    // same key" this was caught from.
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
      if (opts?.resetToTop) setResetToTopSignal((n) => n + 1);
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
  // AND React Strict Mode's dev-only mount→cleanup→remount replay, which
  // re-runs this effect a second time with the exact same `tab` — an
  // invocation-COUNT guard (a plain "have I run once yet" ref) can't tell
  // that replay apart from a real tab change, since the ref's mutated value
  // survives the simulated remount; comparing the actual VALUE can, since
  // nothing about `tab` differs between the two passes). Firing this
  // spuriously would mean fetching the base feed twice on every page load —
  // and, worse, discarding a freshly-restored feedSnapshot position (see
  // that field's own docstring) for a pointless reset back to the top.
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

  // Only the very first card is a safe place to arm this gesture — on any
  // other card, a downward drag already means "go to the previous gist"
  // (useOverscrollNav, attached per-card). Native touch events bubble past
  // that handler's own preventDefault() up to this one regardless of which
  // gesture "claimed" it first, so without this gate, a longer/slower
  // swipe-to-previous could fire a full feed reload at the same time it
  // navigates — two unrelated things happening on one motion. Index 0 is
  // the one place "go to previous" is already a no-op, so nothing is lost
  // by letting pull-to-refresh live there instead.
  const atFirstGist = !current || (gists.length > 0 && current.gist_id === gists[0]?.gist_id);
  const { pull, state, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(
    () => load({ resetToTop: true }),
    atFirstGist,
  );

  // Prefetch comments for whichever gists are actually on screen at mount,
  // and — only when there was nothing fresh enough to restore — seed the
  // store from SSR data the same way this always has. A restoredSnapshot
  // already fully seeded local `gists`/`tab` state above; running
  // primeFromServer(initialGists) on top of that would just overwrite the
  // store's cache with the wrong (top-of-feed, not-where-you-were) data
  // for no benefit, and prefetching comments for initialGists instead of
  // the gists actually being shown would warm the wrong cache entries.
  useEffect(() => {
    if (restoredSnapshot) {
      void prefetchComments(restoredSnapshot.gists.map((g) => g.gist_id));
      return;
    }
    if (initialGists.length > 0) {
      void prefetchComments(initialGists.map((g) => g.gist_id));
      // Seed the store + cache directly from what SSR already fetched — no
      // network round trip (we already have the freshest possible data),
      // and no comparison against a stale cache entry from a previous
      // visit. That comparison used to run through list() here and could
      // flag "new gists" moments after a reload that had already shown
      // them from the very first paint — it was comparing the real fresh
      // data against a stale leftover snapshot, not against what was
      // actually on screen.
      primeFromServer(initialGists, { limit: 30 });
    } else {
      // SSR delivered nothing — either the backend was unreachable during
      // SSR, or the feed is genuinely empty. Either way, fall back to a
      // real client-side fetch so the skeleton actually resolves instead
      // of hanging forever (load() is the only path that ever flips the
      // local `loading`/`gists` state — the cache-warm call above never
      // touches them).
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps gistStore's feedSnapshot current so the NEXT mount (e.g. tapping
  // back after checking a profile) can restore straight to this exact spot
  // instead of resetting to the top — see that field's own docstring for
  // the full reasoning. Fires whenever the front-and-center gist changes
  // (swiping) or the list itself does (pagination, a refresh) — cheap, and
  // correctness matters more than the extra writes: missing one just means
  // the next restore is one swipe behind, not visibly broken.
  useEffect(() => {
    if (!current) return;
    useGistStore.getState().saveFeedSnapshot({
      gists,
      currentGistId: current.gist_id,
      feedMode,
      schoolTag: isSchoolTab ? tab : null,
    });
  }, [current, gists, feedMode, isSchoolTab, tab]);

  // A background offline-queue flush (see OfflineSync, mounted globally)
  // just landed one or more real gists on the server — patch them into the
  // visible feed so they stop showing as local-only optimistic entries.
  // Patches in place (swap the offline- placeholder's gist_id for the real
  // one at the SAME array slot, drop anything that got deleted) rather than
  // calling load() for a full re-fetch — a full re-fetch replaces the whole
  // array with a freshly re-sorted page one, which used to cause two
  // separate visible bugs: the front-and-center card would jump to whatever
  // unrelated gist now landed at the same numeric index (this component's
  // own `current` is just gists[index] under the hood — see GistStack's own
  // reconciliation, which handles the "index now points somewhere new"
  // half of this, but only an in-place patch avoids the reorder that causes
  // it in the first place), and the fresh fetch could overlap with this
  // feed's own separate pagination cursor once loadMore continued past it,
  // showing the same gist twice. gistStore only ever dispatches this event
  // when something list-shaped actually changed (see its own comment), so
  // no debouncing/no-op guard is needed here.
  useEffect(() => {
    const onSynced = (e: Event) => {
      const detail = (
        e as CustomEvent<
          { syncedCreates?: { oldId: string; newId: string; gist?: Gist }[]; deletedGistIds?: string[] } | undefined
        >
      ).detail;
      if (!detail || (!detail.syncedCreates?.length && !detail.deletedGistIds?.length)) {
        // No usable detail (e.g. only an edit synced, which already applied
        // its content locally at edit time — see gistStore's update()) —
        // nothing for this feed to patch.
        return;
      }
      // Prefer the fully-hydrated real gist when it came back (real
      // Cloudinary media URLs) — swapping in just the new id and leaving
      // the placeholder's old `media` behind would keep pointing at its
      // local blob: preview URLs, which gistStore has already revoked by
      // the time this fires (see its own comment on why that URL doesn't
      // survive the sync). Falls back to an id-only patch on the rare
      // chance the re-fetch itself failed — better than leaving it stuck
      // on "offline-" forever.
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
  // activity, not just your own) and live moderation removal — both fired
  // by gistStore's own module-level WS subscriptions, which patch the
  // store's `items` for anything that reads from there but can't reach
  // this component's own local `gists` array directly (see primeFromServer
  // for why that split exists in the first place).
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
    window.addEventListener("kampos:gist-counts-updated", onCounts);
    window.addEventListener("kampos:gist-rejected", onRejected);
    return () => {
      window.removeEventListener("kampos:gist-counts-updated", onCounts);
      window.removeEventListener("kampos:gist-rejected", onRejected);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || gists.length === 0) return;
    // The feed is ranked, not sorted by created_at alone, so the last
    // gist's own id isn't enough to resume from — _feed_cursor is the
    // opaque token that actually encodes its position in that ranking
    // (see gist.repo.ts's listRecent for what's really inside it). Treated
    // as a black box here, same as a plain gist_id used to be before
    // ranking existed.
    const cursor = gists[gists.length - 1]?._feed_cursor;
    if (!cursor) return;
    // Captured, not bumped — this call is a continuation of whatever load()
    // most recently started, not a fresh one of its own. If a tab switch
    // (or pull-to-refresh/retry) starts a newer load() before this resolves,
    // requestGenRef will have moved on and the results below are discarded
    // instead of appending stale gists onto the now-current feed.
    const gen = requestGenRef.current;
    setLoadingMore(true);
    try {
      const params: Record<string, unknown> = { cursor, limit: 30, feed_mode: feedMode };
      if (isSchoolTab) params.school = tab;
      const more = await listGists(params);
      if (gen !== requestGenRef.current) return; // superseded — discard
      if (more.length) {
        setGists((prev) => [...prev, ...more]);
        void prefetchComments(more.map((g) => g.gist_id));
      } else {
        // Cursor pagination genuinely ran out — stop asking. Without this,
        // sitting near the end of the feed re-fires this exact request
        // indefinitely: loadMore's own identity changes every time
        // loadingMore toggles, which re-triggers GistStack's near-end
        // effect even though the list itself never moves.
        setExhausted(true);
      }
    } catch {
      /* best-effort — the near-end trigger will just fire again on the next approach */
    } finally {
      setLoadingMore(false);
    }
  }, [exhausted, gists, listGists, loadingMore, prefetchComments, feedMode, isSchoolTab, tab]);

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
        <div className="relative flex h-full flex-1 flex-col bg-brand/[0.04] dark:bg-brand/[0.07]">
          {/* Header — logo + account icons on their own row (app chrome);
              feed tabs get their own row underneath (X-style: "which feed am
              I looking at" reads as content, not global nav), left-aligned
              so it has room to grow rightward as more filters get added. */}
          {/* z-20, not z-10: the gist stack below sits in its own z-10
              wrapper (see the "relative z-10" container around GistStack),
              which caps every card inside it — even the exiting one at
              zIndex 60 — to that z-10 slot when compared against siblings.
              A pulled/dragged card's visual position can reach up into this
              header's screen area even though its layout box never left the
              feed body, so the header needs to be numerically above that
              z-10 sibling slot, not above the individual card z-indices
              (which never matter here — they're internal to that slot). */}
          <header className="sticky top-0 z-20 w-full shrink-0 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto grid max-w-[740px] grid-cols-[1fr_auto_1fr] items-center px-4 py-2 sm:px-6 md:py-2.5">
              {/* Profile avatar — the account entry point, anchored at the
                  outer left edge (settings/theme toggle live on the profile
                  page now, see below). Plus button balances it on the
                  opposite edge instead of the two sharing one side, so the
                  wordmark actually reads as centered between two anchors
                  rather than centered against a dead spacer. */}
              <Link
                href={myAvitag ? `/${myAvitag}` : "/feed"}
                aria-label="Your profile"
                className="flex h-9 w-9 shrink-0 items-center justify-center justify-self-start overflow-hidden rounded-full ring-1 ring-line transition hover:ring-brand"
              >
                <Avatar src={myImageUrl} />
              </Link>

              <Wordmark
                accentClassName="text-brand"
                className="justify-self-center text-lg sm:text-xl"
              />

              {/* Compose trigger — squeezed onto the wordmark's row (which
                  had height to spare) instead of its own full row below.
                  One consistent condensed pill style at every breakpoint,
                  not the old mobile-pill/desktop-underline split, since
                  this slot is always a short single line now. */}
              <div className="relative shrink-0 justify-self-end">
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
              <div className="inline-flex items-center gap-2 overflow-x-auto no-scrollbar">
                {tabButtons}
              </div>
            </div>
          </header>

          {/* Feed body — doodle tiled across the whole area behind the compose
              trigger + card (never in the header/navbar). Tiled rather than
              stretched: the source art is a tall 360×800 scattered doodle, not
              a seamless single-image cover, so tiling is what lets it genuinely
              fill a wide area without cropping most of it away. */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center pb-0 pt-3 sm:pt-4 md:pb-6">
            <div
              aria-hidden
              // The SVG bakes in its own 8% fill-opacity per path (subtle by design),
              // so the wrapper needs full opacity, not another multiplier on top of
              // that — otherwise the two compound into near-invisible. In dark mode
              // the doodle's dark-gray ink would vanish against a dark canvas, so we
              // invert it to light strokes instead.
              className="pointer-events-none absolute inset-0 z-0 opacity-100 dark:opacity-90 dark:invert"
              style={{
                backgroundImage: "url('/brand/doodles.svg')",
                backgroundRepeat: "repeat",
                backgroundSize: "280px auto",
              }}
            />

            {loading ? (
              <div className="relative z-10 flex min-h-0 flex-1 w-full flex-col">
                <div className="flex min-h-0 w-full flex-1 justify-center px-4">
                  <div className="h-full w-full max-w-[620px] md:max-w-[740px]">
                    <GistCardSkeleton />
                  </div>
                </div>
                {/* Same shape as the real mobile comment bar below (pill +
                    circular button) — without this, that bar simply didn't
                    exist yet during loading, so it popped into existence
                    the instant the gists arrived instead of already being
                    part of what the skeleton previewed. */}
                <div className="flex w-full shrink-0 animate-pulse items-center gap-3 bg-surface px-4 py-3 dark:bg-brand-ink md:hidden">
                  <div className="flex-1 rounded-3xl bg-[#A9C9F85C]/50 px-4 py-4">
                    <div className="h-4 w-24 rounded-full bg-white/30 dark:bg-white/15" />
                  </div>
                  <div className="h-11 w-11 shrink-0 rounded-full bg-line/50" />
                </div>
              </div>
            ) : gists.length ? (
              <div
                className="relative z-10 flex min-h-0 flex-1 w-full flex-col"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <PullIndicator pull={pull} state={state} />
                <NewGistsPill
                  onLoad={async () => {
                    // Instant path: the background refresh already cached
                    // the fresh list — swap it in with zero network wait.
                    // Only fall back to a real fetch if nothing was cached
                    // (shouldn't normally happen; hasNewGists implies it was).
                    const fresh = await useGistStore.getState().loadNewGists();
                    if (fresh) {
                      setGists(fresh);
                      setExhausted(false);
                      setLoadError(false);
                      void prefetchComments(fresh.map((g) => g.gist_id));
                    } else {
                      void load();
                    }
                  }}
                />
                {/* On mobile the card no longer fills the whole remaining
                    height — a compact comment input sits below it, flush,
                    with zero forced gap either side. The input takes only
                    its own natural height (shrink-0, not a fixed 20% flex
                    share — a forced band left dead space around the actual
                    pill-shaped input, exactly the "margins" that shouldn't
                    be there); the card (flex-1) fills whatever's left,
                    which lands close to that ~80% anyway. Desktop reverts
                    both to their original behavior: the card back to
                    filling the whole area, the mobile composer hidden
                    entirely (the real CommentPanel already covers that in
                    its own side pane there). */}
                <div className="flex min-h-0 w-full flex-1">
                  <GistStack
                    gists={gists}
                    initialIndex={initialGistIndex}
                    resetToTopSignal={resetToTopSignal}
                    showCampusTag={feedMode === "amebo"}
                    onCurrentChange={setCurrent}
                    onGistDeleted={(gistId) =>
                      setGists((prev) =>
                        prev.filter((g) => g.gist_id !== gistId),
                      )
                    }
                    onGistEdited={(fresh) =>
                      setGists((prev) =>
                        prev.map((g) =>
                          g.gist_id === fresh.gist_id ? fresh : g,
                        ),
                      )
                    }
                    onNearEnd={loadMore}
                    mediaPaused={showCreate || showCommentSheet}
                  />
                </div>
                {/* Natural height only (shrink-0) — sits immediately below
                    the card with zero gap, and its own bottom edge sits
                    flush against the bottom of the screen (the outer
                    container's bottom padding was dropped on mobile for
                    exactly this — see its own comment above).

                    This is NOT a real input — tapping it never focuses
                    anything in place, it just opens CommentSheet (the real
                    comment surface, autofocused input and all) — a button
                    styled to look like one, same "tap to open the real
                    thing" pattern the gist compose-trigger up top uses. */}
                {/* Solid fill both themes — needed so the doodle pattern
                    tiled behind the whole feed column doesn't show through
                    this area — but no border/shadow/ring of its own, so it
                    reads as part of the page rather than a second, separately
                    boxed card sitting on top of the pill. */}
                <div className="flex w-full shrink-0 items-center gap-3 bg-surface px-4 py-3 dark:bg-brand-ink md:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setCommentSheetAutoFocus(true);
                      setShowCommentSheet(true);
                    }}
                    className="block flex-1 rounded-3xl border-0 bg-[#A9C9F85C] px-4 py-4 text-left font-nunito text-sm text-ink/50"
                  >
                    Talk your own...
                  </button>
                  {/* Icon + live count, both inside the circle, for whichever
                      gist is currently in view (current, not gists[0] —
                      updates as the stack is swiped). Just opens the sheet
                      to look, so it does not autofocus the composer the way
                      the pill does. */}
                  <button
                    type="button"
                    onClick={() => {
                      setCommentSheetAutoFocus(false);
                      setShowCommentSheet(true);
                    }}
                    aria-label="View comments"
                    className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-brand text-white shadow-sm shadow-brand/30"
                  >
                    <CommentIconFill className="h-4 w-4" weight="fill" />
                    <span className="font-nunito text-[9px] font-medium leading-none tabular-nums">
                      {compactNumber(current?.counts?.comments_count)}
                    </span>
                  </button>
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

        {/* Right pane — comments, fixed width. Desktop-only (hidden below
            md): at a fixed 360px it would otherwise crush the whole feed
            column on a phone-width viewport. GistMediaOverlay's own
            `md:right-[360px]` already assumed this panel was desktop-only —
            this is what actually makes that assumption true. */}
        <div className="hidden h-full w-[360px] shrink-0 md:block">
          <CommentPanel gist={current} />
        </div>
      </div>

      <CreateGistSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onPosted={(fresh) =>
          setGists((prev) => {
            // Land right after whatever gist is currently in view — not
            // the end of a list that could be hundreds deep — so the very
            // next swipe shows the gist just posted, purely a local
            // insertion position (the backend's own ordering/pagination is
            // untouched). Falls back to the front of the list on the rare
            // chance nothing's currently in view (e.g. an empty feed).
            const idx = current
              ? prev.findIndex((g) => g.gist_id === current.gist_id)
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
        gist={current}
        autoFocusInput={commentSheetAutoFocus}
      />
    </AppShell>
  );
}
