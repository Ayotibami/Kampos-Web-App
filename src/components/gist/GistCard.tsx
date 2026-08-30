"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, type MotionValue } from "framer-motion";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";
import { Avatar } from "@/components/ui/Avatar";
import { SHORT_TEXT, ExpandableText, MediaBlock } from "./GistMediaGrid";
import { GistMediaOverlay } from "./GistMediaOverlay";
import { CampusTag, MajorTag, LevelTag } from "./GistTags";
import { ReactionButton } from "./ReactionButton";
import { MobileReactionBadge } from "./MobileReactionBadge";
import { ReportModal } from "./ReportModal";
import { ShareModal } from "./ShareModal";
import { ErrorModal, ConfirmModal } from "@/components/ui/FeedbackModal";
import { apiErrorMessage } from "@/lib/api";
import { useGistStore } from "@/stores/gistStore";
import { useAuthStore } from "@/stores/authStore";
import { requireAuth } from "@/lib/requireAuth";
import { useIsMobile } from "@/lib/useIsMobile";
import { useOverscrollNav } from "@/lib/useOverscrollNav";
import {
  ShareIconFill,
  FlagIconFill,
  DotsIconFill,
  ReactionIconFill,
  ViewIconFill,
  EditIconFill,
  DeleteIconFill,
} from "@/components/ui/icons";
import type { Gist, ReactionType } from "@/types";
import { gistColorForGist } from "@/lib/brand";
import { fitHeroBlock, nominalHeroTextRem } from "@/lib/heroText";
import { timeAgo, friendlyDateTime, compactNumber } from "@/lib/format";

// Controlled dialog, same reasoning as FeedContent.tsx's own dynamic()
// calls — pulls the compose sheet (+ its nested GiphyPicker/WebcamCapture)
// out of the main feed chunk.
const CreateGistSheet = dynamic(() => import("./CreateGistSheet").then((m) => m.CreateGistSheet), {
  ssr: false,
});

// The only Lottie usage in this file, and it's the center-pop reaction
// burst — mounted exclusively inside `{centerBurst && (...)}` below, i.e.
// strictly AFTER a reaction is actually picked, never as part of a card's
// default/resting look. Unlike ReactionButton's row icons (which need a
// live ref to trigger .play() on click, and lottie-react's default export
// doesn't forward refs cleanly through next/dynamic) or the always-visible
// satellite/hero icons in MobileReactionBadge/ProfileGistCard (which would
// show a blank gap on first paint if lazy), this one is pure autoplay,
// no ref, and never part of the initial render — the one Lottie usage
// across the whole app where deferring it costs nothing and can't regress
// anything. Left the others eager on purpose; see the perf pass notes.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

// Hero statement block sizing lives in lib/heroText.ts — shared with the
// compose sheet's live preview, so composing genuinely shows what posting
// will look like instead of two independently-tuned approximations.

/**
 * A single gist's content: profile header, engagement metrics, then either a
 * bold colored card (short text) or text + media (longer). Ported from the
 * mobile Gist component. Rendered inside the animated stack shell.
 *
 * Wrapped in memo — GistStack keeps several of these mounted at once for
 * the cascading peek, and re-renders itself on every single index change
 * (each scroll/swipe/arrow-key step). Without memo, every mounted card —
 * not just the one or two whose isActive actually flipped — fully
 * re-rendered on every step, right in the same frame the stack transition
 * starts. That's real work (this component alone carries a dozen-plus
 * pieces of state) landing exactly when the frame budget is tightest,
 * which is what read as the stack "hanging" mid-scroll. Only pays off
 * as long as callers pass stable callback identities — see GistStack's
 * own useCallback around onOverlayOpenChange.
 */
export const GistCard = memo(function GistCard({
  gist,
  isActive = true,
  showCampusTag = true,
  onOverlayOpenChange,
  onDeleted,
  onEdited,
  onNext,
  onPrev,
  canGoNext = true,
  canGoPrev = true,
  touchSurfaceRef,
  dragY,
  opacity,
  committingRef,
}: {
  gist: Gist;
  isActive?: boolean;
  /** Amebo mixes schools together, so the campus chip is real information
   * there — worth showing. Gist is already scoped to just your own school
   * (see FeedContent's feed_mode), so repeating the same campus on every
   * single card would just be noise; that tab passes false. Defaults true
   * since every other place GistCard renders (profile page, shared-link
   * page) isn't tab-scoped at all, and should keep showing it same as
   * before this existed. */
  showCampusTag?: boolean;
  /** Fires whenever the bigger media overlay opens/closes on this card, so
   * the stack above knows to stop treating keyboard/wheel as "switch gist"
   * while it's up — those should drive the overlay's own media instead. */
  onOverlayOpenChange?: (open: boolean) => void;
  /** Fires after a successful delete — the stack owns the gist list, not
   * this card, so it has to be told to actually remove it. */
  onDeleted?: (gistId: string) => void;
  /** Fires after a successful edit with the fresh gist — same reasoning as
   * onDeleted, the parent's list is what actually needs updating, not this
   * card's own local props. */
  onEdited?: (gist: Gist) => void;
  /** GistStack's own next()/prev() — only ever passed for the actual front
   * card (see GistStack), and only ever fired by a vertical drag once
   * whatever's being touched has nothing left to scroll (see
   * useOverscrollNav) — same underlying navigation as the existing
   * horizontal swipe, just a second way in. */
  onNext?: () => void;
  onPrev?: () => void;
  /** Whether onNext/onPrev actually have somewhere to go right now — see
   * useOverscrollNav's own docs on canGoNext/canGoPrev. Threaded straight
   * through to every useOverscrollNav call site below, same path dragY
   * already takes. Defaults true (unchanged behavior) so every caller
   * except GistStack's own mobile front card doesn't need to think about
   * this at all. */
  canGoNext?: boolean;
  canGoPrev?: boolean;
  /** Where the vertical-overscroll gesture's touch listeners actually
   * attach — the whole card frame (header, body, footer), not just
   * whatever's scrollable, so the gesture works no matter where on the
   * card a thumb lands. See useOverscrollNav's own docs. */
  touchSurfaceRef: RefObject<HTMLElement | null>;
  /** The card's own live vertical position while a swipe is in progress —
   * only ever passed by GistStack's mobile front card (see there), shared
   * down into whichever of this card's own useOverscrollNav call, or the
   * media backdrop's/caption panel's, is actually the one currently
   * listening for the gesture. See useOverscrollNav's own docstring for
   * why this has to be one shared value rather than each owning its own. */
  dragY?: MotionValue<number>;
  /** The card's own opacity, animated only at commit/entrance, never
   * during the live drag itself — see useOverscrollNav's own docs. Same
   * sharing reasoning as dragY. */
  opacity?: MotionValue<number>;
  /** Shared with GistStack's own usePresence-based exit handling — see
   * useOverscrollNav's own docs on why this needs to be an explicit flag
   * rather than inferred from dragY's value. Same sharing reasoning as
   * dragY itself: only ever passed by GistStack's mobile front card. */
  committingRef?: RefObject<boolean>;
}) {
  const reactGist = useGistStore((s) => s.react);
  const unreactGist = useGistStore((s) => s.unreact);
  const report = useGistStore((s) => s.report);
  const removeGist = useGistStore((s) => s.remove);
  const shareGist = useGistStore((s) => s.share);
  // Mounted exclusively, never both at once — otherwise a double-tap's
  // externalTrigger would fire two separate optimistic updates (and two
  // network calls) for the same reaction, one from each instance.
  const isMobile = useIsMobile();
  const avitag = useAuthStore((s) => s.avitag);

  const [showActions, setShowActions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  // Seeded from the server (persists across reloads), not just this
  // session's own clicks — a genuine "did I already report this," not a
  // local-only UI nicety that reset the moment the page refreshed.
  const [reported, setReported] = useState(!!gist.my_report);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [reportError, setReportError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const [reactError, setReactError] = useState<string>();
  const actionsRef = useRef<HTMLDivElement>(null);

  const hasMedia = !!gist.media && gist.media.length > 0;

  // Which media item (if any) the bigger overlay view is currently open on.
  // Declared here (ahead of useOverscrollNav below, which needs it) rather
  // than further down where it conceptually "belongs" with the rest of the
  // media-overlay state.
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);

  useEffect(() => {
    onOverlayOpenChange?.(overlayIndex !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayIndex]);

  // The whole body's vertical-drag-past-the-edge → next/prev gist — see
  // useOverscrollNav. One call now covers both text-only AND media gists
  // (text above, media below — see the body render further down), since
  // both share the exact same single scrollable column; previously this was
  // three separate useOverscrollNav instances split across this component
  // and GistMediaBackdrop/GistMediaBodyPanel, one of which was live at a
  // time depending on hasMedia/mediaMode. Disabled while the bigger overlay
  // is open — that view drives its own gestures, this card's shouldn't
  // also react to the same touch underneath it.
  const { scrollRef } = useOverscrollNav<HTMLDivElement>({
    surfaceRef: touchSurfaceRef,
    onNext,
    onPrev,
    enabled: isActive && overlayIndex === null,
    dragY,
    opacity,
    canGoNext,
    canGoPrev,
    committingRef,
  });

  // How much real, measured room is actually left for media once the
  // caption above it has taken its share — a flat CSS cap (the old
  // max-h-[420px] every tile used unconditionally) has no way to know
  // that, so a single photo could end up taller than what's actually
  // visible in the card, forcing a scroll just to see the rest of the
  // ONE photo there is. Measuring for real means the first (or only)
  // media item can be sized to fit fully, guaranteed, every time — see
  // MediaBlock/MediaTile's own fitHeightPx docs for how this number gets
  // used. Same measure-the-real-box approach ShortGist already uses
  // further down this file, just measuring a sibling's height instead of
  // fitting text into a box.
  const textWrapperRef = useRef<HTMLDivElement>(null);
  const [mediaFitHeightPx, setMediaFitHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!hasMedia) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const measure = () => {
      const containerHeight = scrollEl.clientHeight;
      const textEl = textWrapperRef.current;
      const textHeight = textEl?.offsetHeight ?? 0;
      // Matches ExpandableText's own mt-2.5 gap to whatever follows it —
      // only actually present when there's a caption to leave a gap under.
      const gap = textEl ? 10 : 0;
      const next = Math.round(containerHeight - textHeight - gap);
      setMediaFitHeightPx(next > 0 ? next : null);
    };

    measure();
    // Covers both a window/orientation resize (scrollEl's own box changes)
    // and the caption being expanded/collapsed via "...more" (textEl's own
    // box changes) — either one means the available media budget changed.
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    if (textWrapperRef.current) ro.observe(textWrapperRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMedia, gist.gist_id, gist.gist_text]);

  // Double-tap-to-react (Instagram-style) — anywhere on a text-only card
  // (gists with media keep their tiles' own established single-tap meanings
  // — open overlay / toggle mute-play — which a competing double-tap gesture
  // would conflict with there). "Anywhere" excludes actual buttons/links so
  // e.g. double-clicking the three-dot menu doesn't also fire a reaction.
  const lastTapRef = useRef(0);
  const [reactTrigger, setReactTrigger] = useState<{ type: ReactionType; nonce: number } | null>(null);
  // Shared by both double-tap and a row-click selection (via ReactionButton's
  // onReacted) — same big center-pop animation either way, showing whichever
  // emoji was actually picked (always LOVE for double-tap, any of the 5 for
  // a row click).
  const [centerBurst, setCenterBurst] = useState<{ id: number; type: ReactionType } | null>(null);
  const handleDoubleTapReact = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      // Gated here too, not just inside ReactionButton's own externalTrigger
      // effect — that guard stops the row/count from actually updating, but
      // the big center-burst celebration below is fired independently and
      // would otherwise still play for a guest whose reaction never happened.
      if (!requireAuth("react to gists")) return;
      setReactTrigger({ type: "LOVE", nonce: now });
      setCenterBurst({ id: now, type: "LOVE" });
    } else {
      lastTapRef.current = now;
    }
  };

  const isOwn = gist.avitag === avitag;
  // Still sitting in the offline queue, not a real gist on the server yet
  // (see gistStore.create/update's offline branch) — reacting/reporting/
  // sharing/deleting against it would just hit the backend with an id that
  // doesn't exist, so those are guarded below with a friendly message
  // instead of a confusing network-error one.
  const isPending = gist.gist_id.startsWith("offline-");

  // The left-hand metrics row's reactions_count reads straight off
  // gist.counts, which only ever updates once the counts:updated WS
  // broadcast round-trips back — unlike the reaction badge/tray, which
  // bumps its own count instantly via local state. Without this, tapping
  // react felt laggy on the one number that's actually visible without
  // opening the badge. Mirrors gistStore's own "grows only the first time
  // you react" rule — switching type doesn't add a second reaction.
  const [localReaction, setLocalReaction] = useState<ReactionType | null>(gist.my_reaction ?? null);
  const [reactionDelta, setReactionDelta] = useState(0);

  useEffect(() => {
    setLocalReaction(gist.my_reaction ?? null);
  }, [gist.my_reaction]);

  // Reset reactionDelta the instant the real count arrives, same fix as
  // the double-count bug in ReactionButton/MobileReactionBadge — the
  // authoritative number already includes this reaction by the time the
  // broadcast lands, so the delta must not still be added on top. This has
  // to happen during render, not in a useEffect: an effect runs *after*
  // React has already committed and painted a frame showing the fresh
  // prop PLUS the still-stale delta added together (the visible "1 → 2 →
  // 1" flicker), then fixes it a frame later. Resetting here instead means
  // React throws away and redoes this render before anything paints, so
  // there's no flicker frame to see.
  const prevReactionsCountRef = useRef(gist.counts?.reactions_count);
  if (prevReactionsCountRef.current !== gist.counts?.reactions_count) {
    prevReactionsCountRef.current = gist.counts?.reactions_count;
    if (reactionDelta !== 0) setReactionDelta(0);
  }

  const handleReact = async (type: ReactionType) => {
    if (isPending) {
      setReactError("Still saving — this'll be reactable once it's back online and synced.");
      return;
    }
    const isFirstReaction = localReaction === null;
    setLocalReaction(type);
    if (isFirstReaction) setReactionDelta((d) => d + 1);
    try {
      await reactGist(gist.gist_id, type);
    } catch (err) {
      setLocalReaction(gist.my_reaction ?? null);
      if (isFirstReaction) setReactionDelta((d) => d - 1);
      // Surfaced now instead of silently swallowed — a failed react (most
      // commonly: not actually logged in) used to look successful in the
      // UI and then just vanish on reload with no explanation.
      setReactError(apiErrorMessage(err, "Failed to react — try again"));
    }
  };

  const handleUnreact = async () => {
    if (isPending) return;
    const hadReaction = localReaction !== null;
    setLocalReaction(null);
    if (hadReaction) setReactionDelta((d) => d - 1);
    try {
      await unreactGist(gist.gist_id);
    } catch (err) {
      setLocalReaction(gist.my_reaction ?? null);
      if (hadReaction) setReactionDelta((d) => d + 1);
      // Same reasoning as handleReact — without this a failed un-react
      // looked successful until the reaction quietly reappeared on reload.
      setReactError(apiErrorMessage(err, "Failed to remove reaction — try again"));
    }
  };

  // The gist's own real shareable URL — NOT window.location.href, which on
  // the main feed is just "/feed" regardless of which gist you're looking
  // at. This is what makes a shared link actually deep-link back to this
  // specific gist (see the /gist/[gistId] route) instead of dumping
  // whoever clicks it on the generic feed with no idea what was shared.
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/gist/${gist.gist_id}` : `/gist/${gist.gist_id}`;

  // A short teaser, not the raw gist text (which can run up to 5000 chars
  // for a verified profile) — the full gist is one tap away via the link
  // anyway, and a very long `text` payload has been observed silently
  // crashing/closing WhatsApp's iOS share extension right after it opens.
  const SHARE_CAPTION_LIMIT = 200;
  const shareCaption =
    gist.gist_text.length > SHARE_CAPTION_LIMIT
      ? `${gist.gist_text.slice(0, SHARE_CAPTION_LIMIT).trimEnd()}…`
      : gist.gist_text;
  // Combined into one field rather than passed as separate `text`/`url`
  // params — iOS's native share-sheet "Copy" action (and some target
  // apps' share extensions) only reads a single field and silently drops
  // whichever one they don't use, which is exactly what caused Copy to
  // grab the caption but not the link. Folding the link into the text
  // itself means whichever field ends up used still has everything.
  const shareText = `${shareCaption}\n\n${shareUrl}`;

  const handleShare = async () => {
    // The shareUrl above points at /gist/<offline-id>, which doesn't exist
    // server-side yet — nothing to share until this post has actually synced.
    if (isPending) {
      setReactError("Still saving — you can share this once it's back online and synced.");
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        // Mobile's real OS share sheet — already lists whatever's actually
        // installed (WhatsApp, Instagram, X, ...), no per-platform buttons
        // needed here.
        await navigator.share({ text: shareText });
        // navigator.share only resolves once the OS sheet's own action
        // actually completed (not just opened/cancelled), so this reflects
        // a real share the same way the ShareModal callers below do.
        shareGist(gist.gist_id, "native");
        return;
      }
      // Desktop mostly doesn't implement navigator.share at all — explicit
      // platform buttons + copy-link instead (see ShareModal).
      setShowShareModal(true);
    } catch {
      /* user cancelled the share sheet — not an error */
    }
  };

  const handleReport = async (reason: string) => {
    setReporting(true);
    try {
      await report(gist.gist_id, reason);
      setReported(true);
      setShowReportModal(false);
    } catch (err) {
      setReportError(apiErrorMessage(err, "Failed to report this gist"));
    } finally {
      setReporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await removeGist(gist.gist_id);
      setShowDeleteConfirm(false);
      onDeleted?.(gist.gist_id);
    } catch (err) {
      setDeleteError(apiErrorMessage(err, "Failed to delete this gist"));
    } finally {
      setDeleting(false);
    }
  };

  // Tapping the dots again, or anywhere outside the popped-out action
  // buttons, closes them. The report dialog is a separate Modal now, with
  // its own backdrop-click-to-dismiss — not part of this cluster.
  useEffect(() => {
    if (!showActions) return;
    const onClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showActions]);

  const short =
    (gist.gist_text?.length ?? 0) < SHORT_TEXT && !gist.media?.length;

  // Only ever reachable via the shared-link view — that's the one place a
  // REJECTED gist can be the `target` at all (see the backend's getContext:
  // deliberate exception for the specific gist someone shared, never for
  // its APPROVED-only siblings). Renders in place of the real content, same
  // card footprint, so the surrounding stack's swipe navigation still works
  // normally past it — this isn't a dead end, just an empty one.
  if (gist.gist_status === "REJECTED") {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[32px] bg-surface-2 p-8 text-center shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <FlagIconFill size={24} weight="fill" />
        </div>
        <p className="font-nunito text-sm font-semibold text-ink">This gist has been removed</p>
        <p className="max-w-xs font-nunito text-xs text-muted">
          It went against Kampos&apos; community guidelines.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] bg-surface-2 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] sm:p-6 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]">
      {/* Header — z-20 (above the body's z-10): both are separate stacking
          contexts, so without this the body would paint over the header's
          action popup regardless of the popup's own z-index, since that only
          resolves against siblings inside the header, not against body. */}
      <div className="relative z-20 flex items-start gap-3">
        {/* Avatar + name + avitag → the poster's profile — three separate
            Links, not one wrapping the whole row, so the "You" badge,
            timestamp, and campus/major/level tags stay plain, non-
            navigating text instead of getting swept into one giant tap
            target. Not wrapping the Actions menu below either, which is a
            button — nesting a button inside an anchor is invalid. Same
            /avitag route whether it's your own profile or someone else's. */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Link
            href={`/${gist.avitag}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line"
          >
            <Avatar src={gist.image_url} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href={`/${gist.avitag}`}
                className="min-w-0 shrink truncate font-nunito text-sm font-bold text-ink md:text-[15px]"
              >
                {gist.first_name || gist.name || gist.avitag}
              </Link>
              {isOwn && (
                <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 font-nunito text-[10px] font-bold leading-none text-brand md:text-[11px]">
                  You
                </span>
              )}
              <Link
                href={`/${gist.avitag}`}
                className="min-w-0 shrink truncate font-nunito text-xs text-faint md:text-[13px]"
              >
                {gist.avitag}
              </Link>
              <span className="shrink-0 font-nunito text-xs text-faint md:text-[13px]">
                · {timeAgo(gist.created_at)}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {showCampusTag && gist.campus_tag && <CampusTag>{gist.campus_tag}</CampusTag>}
              {gist.major_tag && <MajorTag>{gist.major_tag}</MajorTag>}
              {gist.level && <LevelTag>{gist.level}</LevelTag>}
            </div>
          </div>
        </div>

        {isPending && (
          <span className="mt-1.5 shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 font-nunito text-[10px] font-bold leading-none text-warning md:text-[11px]">
            Pending
          </span>
        )}

        {/* Actions — a three-dot trigger that pops share/flag out
            straight below it, each with its own distinct entrance so the
            reveal feels alive rather than templated. Tap the dots again, or
            anywhere outside, to close. z-30 so it always sits above the body
            text/media (z-10) below it in the card, regardless of DOM order. */}
        <div ref={actionsRef} className="relative z-30 shrink-0">
          <motion.button
            type="button"
            aria-label={showActions ? "Close actions" : "More actions"}
            onClick={() => setShowActions((v) => !v)}
            animate={{ rotate: showActions ? 90 : 0 }}
            whileTap={{ scale: 0.88 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand transition hover:bg-brand/20"
          >
            <DotsIconFill size={14} weight="fill" />
          </motion.button>

          <AnimatePresence>
            {showActions && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1, staggerChildren: 0.035 }}
                className="absolute top-full right-0 z-30 mt-2 flex flex-col items-end gap-1.5"
              >
                <PopActionButton
                  label="Share"
                  onClick={handleShare}
                  icon={<ShareIconFill size={17} weight="fill" />}
                />

                {isOwn ? (
                  <>
                    {/* Your own gist: edit/delete are the real actions here —
                        reposting or reporting your own post isn't a thing. */}
                    <PopActionButton
                      label="Edit"
                      onClick={() => {
                        setShowEdit(true);
                        setShowActions(false);
                      }}
                      icon={<EditIconFill size={17} weight="fill" />}
                    />
                    <PopActionButton
                      label="Delete"
                      onClick={() => {
                        setShowDeleteConfirm(true);
                        setShowActions(false);
                      }}
                      icon={<DeleteIconFill size={17} weight="fill" />}
                      variant="danger"
                    />
                  </>
                ) : (
                  <>
                    <PopActionButton
                      label="Report"
                      onClick={() => {
                        if (reported) return;
                        if (!requireAuth("report gists")) return;
                        setShowReportModal(true);
                        setShowActions(false);
                      }}
                      icon={<FlagIconFill size={17} weight="fill" />}
                      disabled={reported}
                    />
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Body — text above, media below it (Twitter-style, same pattern
          ProfileGistCard already uses), both inside one scrollable column,
          not media as a full-bleed backdrop with the caption burned onto
          it. That old approach forced every photo to be cropped to fill
          whatever shape the backdrop box happened to be, regardless of the
          photo's own real proportions; media here instead keeps its own
          natural shape (see MediaBlock/MediaTile in GistMediaGrid.tsx),
          same as the profile page's tiles already do. The card frame
          itself stays a fixed height (same as always, for the swipe stack)
          — it's the content inside that scrolls when text + media together
          don't fit, exactly the same scroll-vs-swipe boundary behavior a
          long text-only gist already had, just now also covering media.
          Double-tap-to-react listens here (text-only gists only — see
          handleDoubleTapReact), not on the whole card, so it stays scoped to
          the actual content rather than also catching taps on the header/
          footer chrome around it. */}
      <div
        onClick={!hasMedia ? handleDoubleTapReact : undefined}
        className="relative z-10 mt-4 min-h-0 flex-1 overflow-hidden"
      >
        <div
          ref={scrollRef}
          // pb-[60px]: real slack between "I can see I've reached the end"
          // and "I've actually hit the scroll boundary that claims a swipe"
          // — without it, atBottom() (useOverscrollNav) goes true the
          // instant the last pixel of content is visible, so a natural bit
          // of overshoot while finishing a read gets read as a swipe
          // attempt instead of just... finishing the scroll. Covers both
          // branches below (media and long text-only) since they share
          // this one scrollable container.
          className="h-full overflow-y-auto pb-[60px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-brand-dark/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-brand-dark/20 pr-1"
        >
          {hasMedia ? (
            <>
              {gist.gist_text?.trim() && (
                <div ref={textWrapperRef}>
                  <ExpandableText text={gist.gist_text} />
                </div>
              )}
              <MediaBlock
                media={gist.media!}
                onOpenOverlay={setOverlayIndex}
                overlayOpen={overlayIndex !== null}
                active={isActive && !showEdit}
                stackDuo
                fitHeightPx={mediaFitHeightPx ?? undefined}
              />
            </>
          ) : short ? (
            <ShortGist text={gist.gist_text} colorKey={gist.color_key} fallbackSeed={gist.gist_id} />
          ) : (
            <p className="w-full whitespace-pre-wrap break-words font-nunito text-[15px] leading-relaxed text-ink text-justify">
              {gist.gist_text}
            </p>
          )}
        </div>

        {/* Center-pop reaction burst — same animation/placement whether it
            came from a double-tap or a row-click selection (see
            ReactionButton's onReacted below). Pointer-events-none so it
            never itself becomes a tap target. */}
        <AnimatePresence>
          {centerBurst && (
            <motion.div
              key={centerBurst.id}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 0.9] }}
              transition={{ duration: 0.9, times: [0, 0.25, 0.7, 1], ease: "easeOut" }}
              onAnimationComplete={() => setCenterBurst(null)}
            >
              <Lottie
                animationData={REACTION_ANIMATIONS[centerBurst.type]}
                loop={false}
                autoplay
                className="h-28 w-28 drop-shadow-2xl"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions & info — date first, then reactions-total/views/shares (left,
          icon-only for space; date complements the relative time up in the
          header), then the reaction picker on the right. Comments dropped
          from here entirely (both platforms) — it's shown elsewhere already
          (the comment sheet/panel header, and mobile's own bottom-bar
          icon+count), so repeating it here was pure duplication. Reactions
          stays as the one total number here on purpose — the reaction
          badge/tray next to it only ever shows the per-emoji breakdown, not
          a total, so this is the one place a total reaction count is
          actually visible. Share is display-only for now — the actual share
          action lands separately later. */}
      {/* flex-nowrap (not flex-wrap) + the metrics group's own overflow-x-auto
          below is deliberate: on the narrowest real phones (~320-360px) the
          four metrics didn't fit next to the reaction badge, and flex-wrap
          silently dropped the badge onto its own line underneath instead —
          reads as broken, not responsive. Letting the metrics scroll
          horizontally in that rare case keeps the badge exactly where it
          belongs (same row, pinned right) on every width, rather than the
          layout itself shifting depending on how much space happens to be
          available. */}
      <div className="relative z-10 mt-1.5 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1 border-t border-line/40 pt-1.5">
        <div className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-faint">
          <span className="shrink-0 font-nunito text-xs md:text-[13px]">{friendlyDateTime(gist.created_at)}</span>
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs md:text-[13px]">
            <ReactionIconFill size={14} weight="regular" />
            {compactNumber((gist.counts?.reactions_count ?? 0) + reactionDelta)}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs md:text-[13px]">
            <ViewIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.views_count)}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs md:text-[13px]">
            <ShareIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.shares_count)}
          </span>
        </div>
        {/* Mobile: hero + orbit badge — tap opens the vertical picker tray.
            Desktop keeps the classic always-visible row. Double-tap-to-react
            on the card body drives whichever one is actually mounted.
            shrink-0: this is the one thing in the row that must never lose
            width to the metrics group above squeezing against it. */}
        <div className="shrink-0">
          {isMobile ? (
            <MobileReactionBadge
              onReact={handleReact}
              onUnreact={handleUnreact}
              counts={gist.counts?.reactions_by_type}
              initialActive={gist.my_reaction}
              externalTrigger={reactTrigger}
              onReacted={(type) => setCenterBurst({ id: Date.now(), type })}
              guardClick={() => requireAuth("react to gists")}
            />
          ) : (
            <ReactionButton
              onReact={handleReact}
              onUnreact={handleUnreact}
              counts={gist.counts?.reactions_by_type}
              initialActive={gist.my_reaction}
              externalTrigger={reactTrigger}
              onReacted={(type) => setCenterBurst({ id: Date.now(), type })}
              guardClick={() => requireAuth("react to gists")}
            />
          )}
        </div>
      </div>

      <CreateGistSheet
        open={showEdit}
        onClose={() => setShowEdit(false)}
        editGist={gist}
        onPosted={(fresh) => onEdited?.(fresh)}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete this gist?"
        message="This can't be undone — it'll be gone for everyone."
        confirmLabel="Delete"
        icon={<DeleteIconFill size={26} weight="fill" />}
      />

      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
        loading={reporting}
      />
      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        url={shareUrl}
        text={shareCaption}
        onShared={(platform) => shareGist(gist.gist_id, platform)}
      />
      <ErrorModal open={!!reportError} onClose={() => setReportError(undefined)} message={reportError} />
      <ErrorModal open={!!deleteError} onClose={() => setDeleteError(undefined)} message={deleteError} />
      <ErrorModal open={!!reactError} onClose={() => setReactError(undefined)} message={reactError} />

      <AnimatePresence>
        {hasMedia && overlayIndex !== null && (
          <GistMediaOverlay
            media={gist.media!}
            startIndex={overlayIndex}
            onClose={() => setOverlayIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

/** Circular icon button that pops out of the three-dot trigger — matches the
 * dot button's own resting look (soft brand tint, filling solid brand once
 * active/confirmed — same two states the dot button itself uses). Bounces on
 * tap via a springy overshoot, plus a quick expanding ring "ping" for extra
 * tactile feedback since there's no continuous loop to lean on. */
export function PopActionButton({
  icon,
  label,
  onClick,
  disabled,
  variant = "brand",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** "danger" is for irreversible/destructive actions only (Delete) — a
   * deliberate visual pause before something that can't be undone, the
   * same convention iOS/Android/Gmail/Twitter all use. Everything else
   * (Edit, Quote, Report) stays brand-colored; Report isn't destructive to
   * the viewer's own content the way Delete is, so it doesn't get the same
   * treatment even though it's also somewhat consequential. */
  variant?: "brand" | "danger";
}) {
  const [pulse, setPulse] = useState(0);

  const handleClick = () => {
    if (!disabled) setPulse((n) => n + 1);
    onClick();
  };

  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={handleClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.8 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 10 }}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full text-white transition disabled:cursor-default disabled:opacity-40 ${
        variant === "danger" ? "bg-danger" : "bg-brand"
      }`}
    >
      <AnimatePresence>
        {pulse > 0 && (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-white"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      {icon}
    </motion.button>
  );
}

// CampusTag/MajorTag/LevelTag moved to ./GistTags — the profile page's
// header reuses them verbatim, so they live in one place now instead of
// being duplicated.

/**
 * Short, text-only gists get a bold colored "hero" block that fills the card's
 * whole body (not just a floating minimum-height box), so it owns the frame
 * the way a quote card should. Text scales up on larger screens so a very
 * short gist doesn't read as a tiny caption lost in a big colored void.
 *
 * `h-full` degrades gracefully outside the feed's fixed-height stack card
 * too: with no ancestor giving it a real height to be a percentage OF, it
 * resolves to `auto` per spec and `min-h-[160px]` takes over instead — which
 * is exactly the sizing ProfileGistCard wants for its own content-driven
 * (not viewport-locked) list rows. Same component, two contexts, no fork.
 */
export function ShortGist({
  text,
  colorKey,
  fallbackSeed,
}: {
  text: string;
  colorKey?: string | null;
  fallbackSeed: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  // Starts at the length-driven nominal size (a pure function of text.length
  // — no DOM measurement needed), not the flat HERO_TEXT_MAX_REM ceiling.
  // This is what the server actually renders into the initial HTML too, so
  // a page reload paints something already close to correct instead of
  // always starting at the absolute maximum size and visibly snapping down
  // once hydration finally lets the layout effect below measure and correct
  // it — a useLayoutEffect only actually runs before paint for a live
  // client-side mount, not for the very first paint of server-rendered
  // HTML, which happens before any JS has run at all.
  const [fontSizeRem, setFontSizeRem] = useState(() => nominalHeroTextRem(text.length));

  // Runs synchronously after layout but before paint, so there's no visible
  // flash of the wrong size — starts from the length-driven nominal size,
  // then shrinks further only if that still overflows this particular box.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    const fit = () => setFontSizeRem(fitHeroBlock(el, container, nominalHeroTextRem(text.length)));

    fit();
    // Covers device rotation / the card resizing under it — a static
    // one-time measurement would otherwise go stale and start overflowing
    // (or under-filling) the moment the container's own size changes.
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-[160px] w-full items-center justify-center overflow-hidden rounded-3xl p-4 text-center sm:p-5"
      style={{ backgroundColor: gistColorForGist(colorKey, fallbackSeed) }}
    >
      <p
        ref={textRef}
        className="min-w-0 break-words font-nunito font-bold leading-snug text-white"
        style={{ fontSize: `${fontSizeRem}rem` }}
      >
        {text}
      </p>
    </div>
  );
}
