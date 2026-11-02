"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, animate, motion, usePresence, useMotionValue, useTransform } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { FeedGistCard } from "@/components/gist/FeedGistCard";
import { CommentList } from "@/components/comment/CommentList";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { CommentComposer, type CommentComposerHandle } from "@/components/comment/CommentComposer";
import { Avatar } from "@/components/ui/Avatar";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { ChevronLeft } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { useGistStore } from "@/stores/gistStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { EXIT_DISTANCE_PX } from "@/lib/useOverscrollNav";
import type { GistContext } from "@/lib/serverGist";
import type { Gist } from "@/types";

// This gesture is primarily a touch one (even though it's driven by the
// generic Pointer Events API), so it uses GistStack.tsx's own MOBILE
// thresholds, not its desktop drag's (90px) — a phone-sized thumb swipe
// just doesn't travel as far as a deliberate mouse drag, and 90px made
// this feel like it needed a dramatic, repeated drag before it would
// ever commit. 32px (useOverscrollNav's own SWIPE_THRESHOLD_PX) is what
// the original mobile gesture was actually calibrated against.
const SWIPE_THRESHOLD_PX = 32;
const SWIPE_VELOCITY = 500;
const SNAP_BACK_SPRING = { type: "spring", stiffness: 500, damping: 32 } as const;
// TEMPORARY — slowed to 1.2s (real speed is useOverscrollNav's own
// COMMIT_EXIT_S, 0.5s) purely so the swipe transition can be watched
// frame by frame to check for glitches. Revert to
// `import { EXIT_DISTANCE_PX, COMMIT_EXIT_S } from "@/lib/useOverscrollNav"`
// and `DEBUG_SLOW_DURATION_S = COMMIT_EXIT_S` once confirmed clean.
const DEBUG_SLOW_DURATION_S = 1.2;

// Start fetching more neighbors once the viewer is this close to either
// end of what's currently loaded, so they never actually hit a hard edge
// mid-swipe.
const LOAD_MORE_EDGE_DISTANCE = 3;
const LOAD_MORE_BATCH = 10;

/**
 * One card's full slide: this is the actual "rise and fall" motion —
 * the SAME recipe GistStack.tsx's own mobile branch used (see its
 * GistStackCard and useOverscrollNav's own docs on EXIT_DISTANCE_PX/
 * COMMIT_EXIT_S), just driven by a real horizontal drag instead of that
 * version's vertical-touch-mapped-to-horizontal-motion hack. A fresh
 * mount starts fully off-screen (EXIT_DISTANCE_PX, well past any real
 * device width) on whichever side `direction` points to and eases to
 * rest; a committed swipe continues on to the opposite full distance;
 * rotation is derived from the live x position the whole time (not a
 * fixed value), so the card visibly tilts as it travels, more as it gets
 * further from center — not a subtle in-place settle.
 */
function SwipeCard({
  gist,
  direction,
  isFront,
  canGoNext,
  canGoPrev,
  onCommit,
  onToggleComments,
  commentsAnchorRef,
}: {
  gist: Gist;
  /** Which side this card arrived from / should fall toward — 1 if the
   * swipe that brought it (or is taking it away) was "next" (advancing
   * to an older gist), -1 for "prev". */
  direction: number;
  /** Only the current, interactive card accepts drag input — an outgoing
   * card mid-exit (still mounted via AnimatePresence) never does. */
  isFront: boolean;
  /** Whether a swipe in that direction actually has somewhere to go RIGHT
   * NOW — a crossed-threshold drag in a direction that doesn't springs
   * back instead of committing, same reasoning GistStack's own
   * canGoNext/canGoPrev documents: never block the gesture itself (it's
   * still fully live, still draggable), just don't fly this card away
   * toward a gist that doesn't exist (yet — the load-more effect
   * elsewhere is what eventually makes one exist). Without this, the
   * parent's goNext/goPrev would correctly no-op at an actual edge, but
   * this card would have ALREADY started flying off-screen with nothing
   * ever mounting to replace it. */
  canGoNext: boolean;
  canGoPrev: boolean;
  /** Commits a swipe in the given direction — the parent's goNext/goPrev. */
  onCommit: (dir: 1 | -1) => void;
  onToggleComments: () => void;
  commentsAnchorRef: RefObject<HTMLDivElement | null> | undefined;
}) {
  const removed = gist.gist_status === "REJECTED";
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-EXIT_DISTANCE_PX, 0, EXIT_DISTANCE_PX], [-16, 0, 16]);
  // Flipped the instant THIS card's own drag commits — read by the exit
  // effect below to know whether an exit animation is already under way
  // (continue it, don't restart) or needs to be kicked off fresh (a
  // wheel/keyboard-triggered change, where x never moved at all).
  const committingRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // Refs, not read directly in the gesture effect below — canGoNext/
  // canGoPrev can change on every single swipe (the parent recomputes
  // them from currentIndex), and that effect deliberately does NOT
  // re-run on every swipe (see its own dependency array) — tearing down
  // and reattaching real touch listeners that often is wasteful and
  // risks dropping a touch that's already in progress. A ref lets
  // onTouchEnd always read the CURRENT value without the effect needing
  // to know these changed. Same pattern useOverscrollNav.ts's own
  // original mobile gesture used for the same reason.
  const canGoNextRef = useRef(canGoNext);
  const canGoPrevRef = useRef(canGoPrev);
  useEffect(() => {
    canGoNextRef.current = canGoNext;
    canGoPrevRef.current = canGoPrev;
  }, [canGoNext, canGoPrev]);

  // Entrance — mount-only, starts fully off-screen and eases to rest.
  useLayoutEffect(() => {
    x.set(direction > 0 ? EXIT_DISTANCE_PX : -EXIT_DISTANCE_PX);
    const controls = animate(x, 0, { duration: DEBUG_SLOW_DURATION_S, ease: "easeOut" });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit — AnimatePresence keeps this mounted until safeToRemove fires,
  // giving it time to actually finish flying off-screen instead of just
  // vanishing. Only starts its own animation when nothing already has
  // (see committingRef above).
  const [isPresent, safeToRemove] = usePresence();
  useEffect(() => {
    if (isPresent) return;
    const controls = committingRef.current
      ? undefined
      : animate(x, direction > 0 ? -EXIT_DISTANCE_PX : EXIT_DISTANCE_PX, { duration: DEBUG_SLOW_DURATION_S, ease: "easeOut" });
    const timer = window.setTimeout(safeToRemove, DEBUG_SLOW_DURATION_S * 1000);
    return () => {
      controls?.stop();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // Raw native TouchEvents via addEventListener, deliberately NOT React's
  // synthetic Pointer Events + touch-action CSS + setPointerCapture (what
  // this used before). That combination is the exact thing Framer's own
  // `drag="x"` was already dropped for (see the removed comment this
  // replaced) — AND is independently a known-shaky pattern on Android
  // Chrome specifically: touch-action tells the COMPOSITOR thread what to
  // allow before JS ever runs, and Android Chrome has documented cases
  // (https://github.com/w3c/pointerevents/issues/295,
  // https://github.com/wesleyegbertsen/CardiPaw/pull/15) where it still
  // lets the OS's system back-gesture win an in-progress horizontal drag
  // out from under touch-action: pan-y, firing pointercancel and aborting
  // the gesture partway through — not a problem on iOS Safari, which is
  // exactly the "works on iPhone, not Android" split this was hitting.
  // GistStack.tsx's own original mobile swipe (useOverscrollNav.ts, see
  // git history — vertical, not horizontal, but the same underlying
  // mechanism question) used raw TouchEvents with touchmove registered
  // non-passive and called preventDefault() directly — no touch-action
  // dependency, no compositor race, and it worked reliably on Android.
  // This rebuilds that same reliable mechanism for the new horizontal
  // gesture rather than carrying the shakier one forward.
  const dragStateRef = useRef<{
    dragging: boolean;
    claimed: boolean;
    // Which finger this gesture belongs to (Touch.identifier, the native
    // equivalent of a pointerId) — without this, a second finger
    // accidentally touching down mid-swipe (easy to do holding a phone,
    // thumb near the edge) could be misread as part of the same gesture.
    // touches[0] usually stays the original finger in practice, but
    // that's implementation behavior, not a spec guarantee — tracking the
    // real identifier is what actually makes that certain.
    touchId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    prevX: number;
    prevT: number;
  }>({ dragging: false, claimed: false, touchId: null, startX: 0, startY: 0, lastX: 0, lastT: 0, prevX: 0, prevT: 0 });
  // Raw finger travel, in px, before a still-undecided touch counts as
  // "claimed" as a horizontal swipe — small enough that a short flick
  // registers, big enough that normal vertical scrolling/reading never
  // gets mistaken for one.
  const CLAIM_SLOP_PX = 8;

  const commit = (dir: 1 | -1) => {
    committingRef.current = true;
    animate(x, dir > 0 ? -EXIT_DISTANCE_PX : EXIT_DISTANCE_PX, { duration: DEBUG_SLOW_DURATION_S, ease: "easeOut" });
    onCommit(dir);
  };

  useEffect(() => {
    const surface = cardRef.current;
    if (!surface || !isFront) return;

    const findTouch = (list: TouchList, id: number) => {
      for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (dragStateRef.current.dragging) return; // a gesture is already in progress — ignore a second finger
      const t = e.touches[0];
      const now = performance.now();
      dragStateRef.current = {
        dragging: true,
        claimed: false,
        touchId: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastT: now,
        prevX: t.clientX,
        prevT: now,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const s = dragStateRef.current;
      if (!s.dragging) return;
      const t = s.touchId !== null ? findTouch(e.touches, s.touchId) : null;
      if (!t) return;
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (!s.claimed) {
        // Not yet decided whether this touch is a horizontal swipe
        // attempt or an ordinary vertical scroll/read. Below the slop, or
        // clearly more vertical than horizontal, leave it alone entirely
        // — native scrolling of the card's own content keeps working
        // exactly as normal, nothing here interferes (touchmove is
        // non-passive below, but simply never calling preventDefault
        // here is what lets the browser's own scroll proceed).
        if (Math.max(Math.abs(dx), Math.abs(dy)) < CLAIM_SLOP_PX) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          s.dragging = false;
          return;
        }
        s.claimed = true;
      }
      // Claimed — this gesture is ours for the rest of its life. Stop the
      // browser (and, on Android, the OS's own edge-back gesture — see
      // this effect's own doc comment) from also trying to claim the
      // same touch.
      e.preventDefault();
      x.set(dx);
      s.prevX = s.lastX;
      s.prevT = s.lastT;
      s.lastX = t.clientX;
      s.lastT = performance.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      const s = dragStateRef.current;
      if (!s.dragging) return;
      // A lifted finger that isn't the one we're tracking (the OTHER hand
      // let go while ours is still down) changes nothing about our
      // gesture — only resolve once our own tracked touch is actually
      // gone from the active list.
      if (s.touchId !== null && findTouch(e.touches, s.touchId)) return;
      s.dragging = false;
      if (!s.claimed) return; // never became a horizontal swipe — nothing to resolve
      // s.lastX/prevX (the tracked touchmove samples) are what resolve
      // this, not changedTouches' own final position — same reasoning
      // this code always used: the most reliable read is the last real
      // move sample, not whatever the release event itself reports.
      const dx = s.lastX - s.startX;
      const dt = s.lastT - s.prevT;
      const velocity = dt > 0 ? ((s.lastX - s.prevX) / dt) * 1000 : 0;
      const wantsNext = dx < -SWIPE_THRESHOLD_PX || velocity < -SWIPE_VELOCITY;
      const wantsPrev = dx > SWIPE_THRESHOLD_PX || velocity > SWIPE_VELOCITY;
      const goingNext = wantsNext && canGoNextRef.current;
      const goingPrev = wantsPrev && canGoPrevRef.current;
      if (!goingNext && !goingPrev) {
        // Under threshold, OR crossed it toward a direction with nowhere
        // to go yet — either way, spring back to resting position
        // instead of just staying wherever the finger let go.
        animate(x, 0, SNAP_BACK_SPRING);
        return;
      }
      commit(goingNext ? 1 : -1);
    };

    // touchstart passive (never preventDefault there, nothing to lose by
    // letting the browser treat it normally up front); touchmove
    // deliberately NOT passive — this is what gives preventDefault()
    // above real teeth the instant a horizontal drag is claimed, exactly
    // the mechanism this whole rewrite is about. touchcancel (a call
    // comes in, the OS shows a system dialog, etc.) resolves the same way
    // touchend does — same callback, but note it carries no useful
    // changedTouches/velocity story either way, so this still correctly
    // falls through to the snap-back path rather than ever committing.
    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    surface.addEventListener("touchcancel", onTouchEnd);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
      surface.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFront]);

  return (
    <motion.div
      ref={cardRef}
      className="absolute inset-0"
      // No touch-action/pointer-capture here on purpose — the gesture
      // effect above attaches real TouchEvent listeners directly instead
      // (see its own doc comment for why), which doesn't depend on this
      // at all. Deliberately not adding it "just in case" either: the old
      // vertical-swipe code this mechanism is modeled on didn't use it,
      // and it's genuinely proven to work on Android without it — piling
      // on untested CSS alongside a proven-working mechanism just adds
      // unverified variables, not safety.
      style={{ x, rotate }}
    >
      {/* Deliberately no border/shadow/rounding here — this is just a
          scroll container for the post + comments, not a card of its own.
          FeedGistCard below already has its own full card treatment
          (border, rounded corners, shadow); wrapping it in a second one
          here read as a border-within-a-border nesting effect, which
          design flagged — only the post's own inner rectangle should
          read as a card. */}
      <div className="mx-auto flex h-full w-full max-w-[600px] flex-col overflow-hidden bg-surface dark:bg-surface-2">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-4 no-scrollbar sm:px-4">
          <FeedGistCard gist={gist} onToggleComments={onToggleComments} />

          {!removed && (
            <div ref={commentsAnchorRef} className="mt-6 scroll-mt-4">
              <h2 className="px-1 font-nunito text-sm font-extrabold text-ink dark:text-white">Comments</h2>
              <CommentList gist={gist} scrollable={false} className="mt-3" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The guest-facing shared-link page: the exact gist someone shared, laid
 * out the same way it already looks and behaves in the feed (same
 * FeedGistCard — same header, repost thread, poll, media, footer buttons)
 * with its comments flowing naturally below it — AND, since this is also
 * where a stranger with no account first meets Kampos, a swipeable row of
 * these full-page cards so there's always a next gist to see, not a dead
 * end. No gate, no compose UI, no settings — every real action (react/
 * comment/report/...) still renders normally either way; a logged-out tap
 * on one shows the shared signup prompt instead of silently failing (see
 * requireAuth, wired inside FeedGistCard/CommentList/CommentComposer
 * themselves, not here).
 *
 * Replaces the earlier plain single-gist page (itself a replacement for
 * the original GistStack swipe-stack) — this is a deliberate return to
 * "swipe for the next gist," just rebuilt on top of full detail pages
 * instead of the old stripped-down preview cards: one card is mounted at
 * a time (same as GistStack's own mobile behavior — see its own doc on
 * why a peeking stack reads as cramped at full card width), carrying its
 * own full post + comments, with the header/composer staying as fixed
 * chrome above it and silently retargeting to whichever gist is current.
 */
export function GistShareView({ context }: { context: GistContext }) {
  const router = useRouter();
  // Swipe-to-next-gist is a phone gesture — on desktop there's room for a
  // real two-column layout instead (post on the left, comments pinned in
  // a side panel on the right, same as the feed's own desktop comment
  // panel), so there's nothing to swipe TO besides whatever's already
  // sitting in view. Starts false (matches every other isMobile-gated
  // card in this codebase — see useIsMobile's own doc on why: this is
  // what the server rendered too, so the very first client render still
  // matches it for hydration) and corrects before paint if the real
  // viewport is actually narrow.
  const isMobile = useIsMobile();
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );
  const myAvitag = useAuthStore((s) => s.avitag);
  const isLoggedIn = useAuthStore((s) => !!s.user);
  // Same convention as DesktopSidebar/MobileTabBar's own "You" nav item —
  // the avatar is the way to your own profile everywhere else in the app,
  // so it stays that here too rather than doubling as a second "back to
  // feed" link; the wordmark (already linking to /feed) is that.
  const myProfileHref = myAvitag ? `/${myAvitag}` : "/feed";

  // Feed convention: index 0 is the newest gist, increasing index moves
  // older — matches how the main feed already orders things. `after`
  // (newer than the target) comes back oldest-first from the backend, so
  // it's reversed to put the newest of that group at the very front;
  // `before` (older) is already newest-first as-is.
  const [orderedGists, setOrderedGists] = useState<Gist[]>(() => [
    ...context.after.slice().reverse(),
    context.target,
    ...context.before,
  ]);
  const [currentIndex, setCurrentIndex] = useState(() => context.after.length);
  // Which way the most recent swipe went — 1 advancing (older), -1 going
  // back (newer) — read by the card transition above to decide which side
  // the incoming card rises in from and the outgoing one falls out to.
  const [direction, setDirection] = useState(1);
  const current = orderedGists[currentIndex] ?? context.target;
  const currentRemoved = current.gist_status === "REJECTED";

  // Mirrors orderedGists/currentIndex without needing either as an effect
  // dependency — lets the load-more effect below read the latest values
  // synchronously without resubscribing/re-running on every single
  // update. Written in an effect, not during render itself (refs are for
  // outside-render reads/writes only).
  const orderedGistsRef = useRef(orderedGists);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    orderedGistsRef.current = orderedGists;
    currentIndexRef.current = currentIndex;
  });

  // Branches on login state rather than sniffing document.referrer — a
  // referrer-based check either misses genuine in-app navigation (a strict
  // referrer-policy header, or an in-app browser, can strip it even when
  // the tap really did come from a notification) or, for a guest, would
  // send them "back" to the external site they shared-linked in from
  // right as they're engaging with the content — exactly the opposite of
  // what a shared link is for. A logged-in viewer always has somewhere
  // sensible to go back to (their own feed), so they always get the
  // chevron; a guest never does, so they never get one.
  const handleBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/feed");
  };

  // Whether a swipe in each direction actually has somewhere to go right
  // now — passed into SwipeCard (see its own doc) so a crossed-threshold
  // drag toward a direction with nothing loaded yet springs back instead
  // of flying this card away with nothing to replace it. The load-more
  // effect below is what eventually makes one exist, at which point the
  // very next swipe works normally.
  const canGoNext = currentIndex < orderedGists.length - 1;
  const canGoPrev = currentIndex > 0;

  // Advances to the next/previous gist — no-ops once there's genuinely
  // nowhere left to go (SwipeCard's own canGoNext/canGoPrev check already
  // keeps this from ever being called in that case via a drag, but wheel/
  // keyboard call these directly, so the guard stays here too).
  const goNext = useCallback(() => {
    if (currentIndexRef.current >= orderedGistsRef.current.length - 1) return;
    setDirection(1);
    setCurrentIndex((i) => i + 1);
  }, []);
  const goPrev = useCallback(() => {
    if (currentIndexRef.current <= 0) return;
    setDirection(-1);
    setCurrentIndex((i) => i - 1);
  }, []);
  // SwipeCard's own onCommit calls this with whichever direction its drag
  // actually resolved to — goNext/goPrev above already guard against
  // going past either end, so this just dispatches.
  const handleSwipeCommit = useCallback(
    (dir: 1 | -1) => {
      if (dir > 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  // Trackpad/mouse-wheel horizontal intent, and the left/right arrow keys —
  // a two-finger trackpad "swipe" fires wheel events, not the pointer-drag
  // events framer-motion's `drag="x"` above listens for, so without this
  // the drag gesture alone only ever responds to an actual touch or a
  // real click-and-drag, never a trackpad swipe — the single most likely
  // way a desktop guest would try to do this. Same recipe GistStack.tsx's
  // own desktop version used (onWheel + keydown), not something invented
  // fresh here.
  const wheelLockRef = useRef(false);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Only clearly-horizontal intent switches gists — vertical wheel
      // scrolls the current card's own content (comments) exactly as
      // normal, never advances it.
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) + 6;
      if (!horizontal || Math.abs(e.deltaX) < 24 || wheelLockRef.current) return;
      wheelLockRef.current = true;
      if (e.deltaX > 0) goNext();
      else goPrev();
      window.setTimeout(() => (wheelLockRef.current = false), 420);
    },
    [goNext, goPrev],
  );
  useEffect(() => {
    // Desktop has no swipe concept at all (see isMobile's own doc above),
    // so arrow keys don't do anything there either — nothing for them to
    // advance to.
    if (!isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, goNext, goPrev]);

  // Only one card is ever mounted at a time (see this component's own
  // doc), so unlike a multi-card-in-DOM layout there's no ambiguity about
  // which card's comments to scroll to — it's always the current one.
  const commentsAnchorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<CommentComposerHandle>(null);
  const handleToggleComments = useCallback(() => {
    commentsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    composerRef.current?.focus();
  }, []);

  // Keeps the visible URL in sync with whichever gist is current — plain
  // History API, not router.replace/push: this page already has every
  // gist's full data in memory, so a real Next.js navigation would only
  // re-fetch and remount everything for no reason. Purely cosmetic
  // (refresh/share-from-here/back-button correctness), not a real route
  // change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextPath = `/gist/${current.gist_id}`;
    if (window.location.pathname !== nextPath) {
      window.history.replaceState(window.history.state, "", nextPath);
    }
  }, [current.gist_id]);

  // Fetches more neighbors once the viewer swipes within reach of either
  // end of what's currently loaded. hasMoreRefs stop this from re-firing
  // forever once a direction's real edge (start/end of this gist's whole
  // chronological history) is actually reached.
  const loadingOlderRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const hasMoreOlderRef = useRef(true);
  const hasMoreNewerRef = useRef(true);
  useEffect(() => {
    const list = orderedGistsRef.current;
    const nearEnd = currentIndex >= list.length - 1 - LOAD_MORE_EDGE_DISTANCE;
    const nearStart = currentIndex <= LOAD_MORE_EDGE_DISTANCE;

    if (nearEnd && hasMoreOlderRef.current && !loadingOlderRef.current) {
      loadingOlderRef.current = true;
      const pivot = list[list.length - 1];
      useGistStore
        .getState()
        .getContext(pivot.gist_id, LOAD_MORE_BATCH, 0)
        .then((ctx) => {
          if (!ctx?.before.length) {
            hasMoreOlderRef.current = false;
            return;
          }
          const seen = new Set(orderedGistsRef.current.map((g) => g.gist_id));
          const fresh = ctx.before.filter((g) => !seen.has(g.gist_id));
          if (!fresh.length) {
            hasMoreOlderRef.current = false;
            return;
          }
          setOrderedGists((prev) => [...prev, ...fresh]);
        })
        .catch(() => {})
        .finally(() => {
          loadingOlderRef.current = false;
        });
    }

    if (nearStart && hasMoreNewerRef.current && !loadingNewerRef.current) {
      loadingNewerRef.current = true;
      const pivot = list[0];
      useGistStore
        .getState()
        .getContext(pivot.gist_id, 0, LOAD_MORE_BATCH)
        .then((ctx) => {
          if (!ctx?.after.length) {
            hasMoreNewerRef.current = false;
            return;
          }
          const seen = new Set(orderedGistsRef.current.map((g) => g.gist_id));
          // Newest-first, same reversal the initial list build uses.
          const fresh = ctx.after.slice().reverse().filter((g) => !seen.has(g.gist_id));
          if (!fresh.length) {
            hasMoreNewerRef.current = false;
            return;
          }
          setOrderedGists((prev) => [...fresh, ...prev]);
          // Prepending at the front shifts every existing index — shift
          // the current index by exactly how much was actually prepended
          // so it keeps pointing at the same gist, not a now-different one
          // that happens to share its old position.
          setCurrentIndex((i) => i + fresh.length);
        })
        .catch(() => {})
        .finally(() => {
          loadingNewerRef.current = false;
        });
    }
  }, [currentIndex]);

  // Live counts (reactions/comments/views from other people's activity)
  // and live moderation removal — same broadcasts FeedContent/ProfileView
  // react to, but this page's own idea of "removed" is different from
  // theirs: they drop the gist from view entirely (it was never meant to
  // be there once rejected), while this page is the one place a REJECTED
  // gist is actually expected to be reachable at all (see the page-level
  // doc comment on the ungated /gist/[gistId] route for why) — so here it
  // flips gist_status in place instead, letting FeedGistCard's own
  // existing REJECTED-placeholder rendering take over. Applied across the
  // whole loaded list, not just the current card — any of them could be
  // the one a broadcast is about.
  useEffect(() => {
    const onCounts = (e: Event) => {
      const { gist_id, counts } = (e as CustomEvent<{ gist_id: string; counts: Partial<Gist["counts"]> }>).detail;
      setOrderedGists((prev) =>
        prev.map((g) => (g.gist_id === gist_id ? { ...g, counts: { ...g.counts, ...counts } as Gist["counts"] } : g)),
      );
    };
    const onRejected = (e: Event) => {
      const { gist_id } = (e as CustomEvent<{ gist_id: string }>).detail;
      setOrderedGists((prev) => prev.map((g) => (g.gist_id === gist_id ? { ...g, gist_status: "REJECTED" } : g)));
    };
    window.addEventListener("kampos:gist-counts-updated", onCounts);
    window.addEventListener("kampos:gist-rejected", onRejected);
    return () => {
      window.removeEventListener("kampos:gist-counts-updated", onCounts);
      window.removeEventListener("kampos:gist-rejected", onRejected);
    };
  }, []);

  // Same signal FeedContent/ProfileView listen for — an offline-queue
  // flush just landed one or more real reacts/comments on the server, and
  // this page isn't guaranteed to have caught the resulting counts:updated
  // broadcast itself (a long offline stretch can leave the WS socket's own
  // reconnect lagging behind the network coming back). Re-fetches every
  // gist currently loaded, same as the old stack version of this page did.
  useEffect(() => {
    const onSynced = () => {
      const { get } = useGistStore.getState();
      Promise.all(orderedGistsRef.current.map((g) => get(g.gist_id).catch(() => undefined))).then((fresh) => {
        const byId = new Map(fresh.filter((f): f is Gist => !!f).map((f) => [f.gist_id, f]));
        setOrderedGists((prev) => prev.map((g) => (byId.get(g.gist_id) ? { ...g, counts: byId.get(g.gist_id)!.counts } : g)));
      });
    };
    window.addEventListener("kampos:gists-synced", onSynced);
    return () => window.removeEventListener("kampos:gists-synced", onSynced);
  }, []);

  // Log a real view (POST /gists/:id/view, unauthenticated-friendly — this
  // page is the guest-facing shared-link entry point) every time the gist
  // actually current changes, not just on first load — a stranger who
  // swipes through several gists is genuinely viewing each one.
  //
  // lastLoggedGistIdRef (not a Set) guards against StrictMode's dev-only
  // double-invoke of this effect on mount, while still letting a genuine
  // later revisit (swipe away and back) log again, since something else
  // will have logged in between.
  const lastLoggedGistIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastLoggedGistIdRef.current === current.gist_id) return;
    lastLoggedGistIdRef.current = current.gist_id;
    void useGistStore.getState().view(current.gist_id);
  }, [current.gist_id]);

  return (
    <AppShell variant="feed">
      {/* AppShell's own outer wrapper is `overflow-hidden` on a `min-h-dvh`
          box — any descendant relying on ordinary document-level scroll
          for its own `position: sticky` header breaks under that (the
          header scrolls away with everything else instead of sticking),
          since that ancestor becomes the nearest "scroll container" sticky
          resolves against, but never actually scrolls itself. Same
          structural fix FeedContent.tsx already uses under this same
          shell: a hard `h-dvh` + `overflow-hidden` box here, with the real
          scrolling happening inside the current card instead, so the
          header (just a shrink-0 flex sibling above it, no sticky needed
          at all) naturally stays put without fighting that ancestor. */}
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-brand/[0.04] dark:bg-brand/[0.07]">
        {/* The status-bar inset as top padding — installed-to-home-screen
            ("standalone") mode has no browser chrome, so the page draws
            from the very top of the physical screen and this header's
            wordmark ended up under the status bar. The padding is on the
            header itself so its own frosted background fills that strip
            instead of leaving a gap of bare page behind it. Resolves to 0
            in a browser tab and on desktop — see layout.tsx's viewportFit
            note for the full story. */}
        <header className="z-10 flex w-full shrink-0 items-center border-b border-line bg-surface/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
          {/* Fixed-width left slot + shrink-0 right slot + a flexible
              middle that centers the wordmark within whatever space is
              left — NOT two equal flex-1 slots either side of a fixed
              center: with flex-basis:0 both of those would've claimed
              equal width regardless of content, and the narrower empty
              left slot would size up to match the right slot's real
              content, pushing its rendered box (and the wordmark right
              after it) over Log in/Sign up on a narrow phone. This way
              the right slot always gets exactly its natural width, so
              nothing it contains can ever collide with the wordmark. */}
          <div className="mx-auto flex max-w-[600px] flex-1 items-center px-4 py-2.5 sm:px-6">
            <div className="flex w-9 shrink-0 items-center">
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Go back"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-brand/10 dark:text-white"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="flex flex-1 items-center justify-center overflow-hidden">
              {/* Stays the wordmark always — doesn't swap for anything as
                  the page scrolls, by design: the heading is fixed. */}
              {/* /feed for real, /feed is auth-gated — a guest tapping
                  this would just get bounced straight to /login. Send
                  them to the marketing/welcome page instead, same as the
                  wordmark means "home" anywhere else a guest can see it. */}
              <Link href={isLoggedIn ? "/feed" : "/"} className="shrink-0 px-2">
                <Wordmark accentClassName="text-brand" className="text-lg sm:text-xl" />
              </Link>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {isLoggedIn ? (
                <Link
                  href={myProfileHref}
                  aria-label="Your profile"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-line transition hover:ring-brand"
                >
                  <Avatar src={myImageUrl} />
                </Link>
              ) : (
                // Just Sign up, not Log in + Sign up — a second pill here
                // made the right slot wide enough to visibly push the
                // centered wordmark off-center against the much narrower
                // fixed-width back-chevron slot on the left. Sign up over
                // Log in since a stranger following a shared link is more
                // likely new to Kampos than a returning user without a
                // session; the signup page itself already links to log in
                // for anyone who needs it.
                <Link href="/signup" className="shrink-0">
                  <Button variant="primary" fullWidth={false} className="!px-4 !py-2 !text-sm">
                    Sign up
                  </Button>
                </Link>
              )}
            </div>
          </div>
          {/* Matches the comment panel's own width exactly (see the
              desktop branch below) — without this, the centered block
              above centers against the FULL page width, which on desktop
              is wider than the post column actually is (the 360px panel
              eats into what would otherwise be page padding), so the
              wordmark visibly sat right of where the post itself is
              centered instead of lining up with it. */}
          {!isMobile && <div className="h-full w-[360px] shrink-0" aria-hidden />}
        </header>

        {isMobile ? (
          <>
            {/* One full card at a time — dragging it sideways past the
                threshold (or a fast-enough flick) commits to the
                next/prev gist, flying this one fully off-screen while
                the new one slides in from the opposite side and eases
                to rest (see SwipeCard's own doc — this is the actual
                original "rise and fall" recipe, not a subtle in-place
                settle). Anything short of the threshold just springs
                back to center. Plus trackpad/mouse-wheel horizontal
                intent and the left/right arrow keys (see handleWheel's
                own doc on why the drag gesture alone isn't enough when
                this layout happens to be showing in a narrow desktop
                browser window with a trackpad, not an actual phone). */}
            <div className="relative z-10 min-h-0 flex-1 overflow-hidden" onWheel={handleWheel}>
              <AnimatePresence initial={false}>
                <SwipeCard
                  key={current.gist_id}
                  gist={current}
                  direction={direction}
                  isFront
                  canGoNext={canGoNext}
                  canGoPrev={canGoPrev}
                  onCommit={handleSwipeCommit}
                  onToggleComments={handleToggleComments}
                  commentsAnchorRef={commentsAnchorRef}
                />
              </AnimatePresence>
            </div>

            {/* Fixed chrome, not part of the card itself — always
                targets whichever gist is current, so commenting never
                needs scrolling first no matter how far into the thread.
                Only makes sense once there's actually something to
                comment ON, hence gated the same way the thread itself
                is. Desktop doesn't need this — CommentPanel below
                already carries its own composer. */}
            {!currentRemoved && (
              <div className="z-10 w-full shrink-0 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-md sm:px-6">
                <div className="mx-auto w-full max-w-[600px]">
                  <CommentComposer ref={composerRef} gist={current} />
                </div>
              </div>
            )}
          </>
        ) : (
          // Desktop: no swipe at all — there's room for a real
          // two-column layout instead, the same shape the feed's own
          // desktop comment panel already uses. The post sits on the
          // left exactly like FeedGistCard looks everywhere else in the
          // app; comments are pinned in a side panel on the right,
          // always open (unlike the feed's own toggled panel — there's
          // no ambiguity here about which gist's comments these are,
          // there's only ever the one).
          <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[600px] px-4 py-4 sm:px-6">
                <FeedGistCard gist={current} onToggleComments={handleToggleComments} />
              </div>
            </div>
            <div className="h-full w-[360px] shrink-0">
              <CommentPanel gist={currentRemoved ? undefined : current} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
