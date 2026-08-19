"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";
import { GistMediaOverlay } from "./GistMediaOverlay";
import { ShortGist, PopActionButton, SHORT_TEXT } from "./GistCard";
import { ReactionButton } from "./ReactionButton";
import { CreateGistSheet } from "./CreateGistSheet";
import { ReportModal } from "./ReportModal";
import { ShareModal } from "./ShareModal";
import { ErrorModal, ConfirmModal } from "@/components/ui/FeedbackModal";
import { apiErrorMessage } from "@/lib/api";
import { useGistStore } from "@/stores/gistStore";
import { useAuthStore } from "@/stores/authStore";
import { requireAuth } from "@/lib/requireAuth";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  ShareIconFill,
  FlagIconFill,
  DotsIconFill,
  ReactionIconFill,
  ViewIconFill,
  CommentIconFill,
  EditIconFill,
  DeleteIconFill,
  PlayIconFill,
  PauseIconFill,
  ExpandIconFill,
  VolumeIconFill,
  MuteIconFill,
} from "@/components/ui/icons";
import type { Gist, GistMedia, ReactionType } from "@/types";
import { cloudinarySmartCrop } from "@/lib/cloudinary";
import { friendlyDateTime, compactNumber } from "@/lib/format";

// A single photo/video keeps its own real proportions instead of being
// force-cropped — max-h-[420px] below (on both the image and video tiles)
// is the one number stopping an extreme panorama or a very tall portrait
// from taking over the list; everything under it just renders at its
// natural size. Written as a literal class, not interpolated from a
// constant — Tailwind resolves arbitrary values at build time by scanning
// for literal strings, so a template-literal class name here would
// silently never generate the CSS.

// Width:height below this, even after the 420px height cap, renders as an
// uncomfortably thin sliver with a lot of bare card beside it — a mild crop
// down to a normal 3:4 portrait reads better than an accurate but oddly
// narrow rectangle. Deliberately looser than it might seem: 9:16 (0.5625)
// is one of the single most common shapes for phone-shot video/photos
// today (Reels/Stories-style), not an outlier — the threshold sits just
// under it so that completely normal ratio still renders fully natural,
// and only genuinely unusual content (a scrolling screenshot, a receipt,
// anything narrower than roughly 9:20) gets cropped. There's no way to
// know this ahead of time from the gist payload alone (no stored
// width/height), so MediaTile/VideoTile measure the real element once it
// loads and only switch to the cropped layout past this point.
const EXTREME_ASPECT_RATIO = 0.45;

// Mobile's own reaction set — same 5 as everywhere else, just listed here
// once since the mobile picker below needs to loop over them itself
// (ReactionButton, used on desktop, already has its own copy of this).
const MOBILE_REACTIONS: ReactionType[] = [
  "LIKE",
  "LOVE",
  "FIRE",
  "SAD",
  "LAUGH",
];

// The trigger's resting look is a direct copy of MobileReactionBadge's own
// hero+orbit — same sizes, same math — since it's meant to read as the
// same mobile reaction identity as the feed, just opening a different
// picker (centered on this card, not a tray) when tapped. See
// MobileReactionBadge.tsx for the original numbers/reasoning.
const MOBILE_HERO_SIZE = 34;
const MOBILE_SATELLITE_SIZE = 20;
const MOBILE_ORBIT_RADIUS = 17;
function mobileOrbitPositions(count: number, startDeg = 45) {
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => {
    const rad = ((startDeg + i * step) * Math.PI) / 180;
    return {
      x: Math.cos(rad) * MOBILE_ORBIT_RADIUS,
      y: Math.sin(rad) * MOBILE_ORBIT_RADIUS,
    };
  });
}

/**
 * A gist, adapted for the profile page's vertical scrolling list — same
 * data, same actions (react/edit/delete/report/share), same GistMediaOverlay
 * for the bigger view, but laid out for "sits in a list among other rows"
 * instead of GistCard's "fills one fixed-height swipe-stack slot":
 *
 *  - Header is just the timestamp + menu — the poster's own profile already
 *    shows their avatar/name/tags once, up top, so repeating it per gist
 *    here would just be noise.
 *  - Text-only short gists still get the feed's colored "hero" treatment
 *    (see ShortGist) — same component, sized to its own content here
 *    instead of a fixed viewport slot.
 *  - Longer text clamps with a "…more" that expands in place and stays
 *    open — no navigating away to read the rest.
 *  - Media sits BELOW the text (Twitter-style), not behind it — the
 *    feed's WhatsApp-style caption-burned-on-photo look is built for a
 *    full-bleed slot this card doesn't have.
 *  - No tap-to-open-the-full-gist-view: a plain tap does nothing here on
 *    purpose, everything (reading, reacting, watching) happens right in the
 *    list. Double-tap-to-react still works, same as the feed, just scoped
 *    off the media block (which already has its own tap meanings) the same
 *    way the feed already scopes it off media gists entirely.
 */
export const ProfileGistCard = memo(function ProfileGistCard({
  gist,
  active,
  onToggleComments,
  onDeleted,
  onEdited,
}: {
  gist: Gist;
  /** True while the desktop comment panel is open AND currently showing
   * this gist — lights up the comment button's own ring (see the footer)
   * so it's obvious which card the panel refers to. */
  active?: boolean;
  /** Fires when the comment button (see the footer) is tapped — the
   * profile page owns whether the panel is open at all and which gist
   * it's showing, this card doesn't track that itself. */
  onToggleComments?: () => void;
  /** The profile page owns the gist list, not this card — same reasoning
   * as GistCard's own onDeleted/onEdited. */
  onDeleted?: (gistId: string) => void;
  onEdited?: (gist: Gist) => void;
}) {
  const reactGist = useGistStore((s) => s.react);
  const unreactGist = useGistStore((s) => s.unreact);
  const report = useGistStore((s) => s.report);
  const removeGist = useGistStore((s) => s.remove);
  const shareGist = useGistStore((s) => s.share);
  const avitag = useAuthStore((s) => s.avitag);

  const [showActions, setShowActions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(!!gist.my_report);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [reportError, setReportError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const [reactError, setReactError] = useState<string>();
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);
  const [overlayStartTime, setOverlayStartTime] = useState(0);
  // Ref that VideoTile populates with get/seek functions so the overlay
  // can hand off the playback position seamlessly — card → overlay → card.
  const videoSyncRef = useRef<{
    getCurrentTime: () => number;
    seek: (time: number) => void;
  } | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const hasMedia = !!gist.media && gist.media.length > 0;
  const isOwn = gist.avitag === avitag;
  const short = (gist.gist_text?.length ?? 0) < SHORT_TEXT && !hasMedia;

  // Double-tap-to-react — same 300ms window as the feed. Excludes buttons/
  // links AND anything inside the media block (`[data-media-block]`), which
  // already has its own tap meanings (open bigger / play-pause) — same
  // reasoning GistCard uses to keep double-tap off media gists entirely,
  // just scoped to the media itself here instead of the whole card, since
  // media no longer covers the whole body.
  const lastTapRef = useRef(0);
  const [reactTrigger, setReactTrigger] = useState<{
    type: ReactionType;
    nonce: number;
  } | null>(null);
  const [centerBurst, setCenterBurst] = useState<{
    id: number;
    type: ReactionType;
  } | null>(null);
  const handleDoubleTapReact = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest(
        "button, a, input, textarea, [data-media-block]",
      )
    )
      return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!requireAuth("react to gists")) return;
      setReactTrigger({ type: "LOVE", nonce: now });
      setCenterBurst({ id: now, type: "LOVE" });
    } else {
      lastTapRef.current = now;
    }
  };

  const handleReact = async (type: ReactionType) => {
    try {
      await reactGist(gist.gist_id, type);
    } catch (err) {
      setReactError(apiErrorMessage(err, "Failed to react — try again"));
    }
  };

  const handleUnreact = async () => {
    try {
      await unreactGist(gist.gist_id);
    } catch (err) {
      setReactError(
        apiErrorMessage(err, "Failed to remove reaction — try again"),
      );
    }
  };

  // Mobile's own reaction picker — desktop keeps the row (ReactionButton,
  // self-contained, unchanged below). A row of 5 emoji-with-counts is wide;
  // fine next to nothing else, too wide next to the comment button this
  // footer also needs on the narrowest phones. Instead: a small trigger in
  // the footer, and on tap the 5 reactions pop out centered over the
  // card's own body — never off-screen, never overlapping a neighboring
  // card the way a tray rising off the trigger itself could on a short
  // card. State lives here (not in a separate component) because the
  // trigger (footer) and the picker overlay (over the body) render in two
  // different places in the tree and need to share it.
  const isMobile = useIsMobile();
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [mobileActive, setMobileActive] = useState<ReactionType | null>(
    gist.my_reaction ?? null,
  );
  const [mobileDelta, setMobileDelta] = useState<
    Partial<Record<ReactionType, number>>
  >({});
  const mobileCountFor = (type: ReactionType) =>
    Math.max(
      0,
      (gist.counts?.reactions_by_type?.[type] ?? 0) + (mobileDelta[type] ?? 0),
    );
  // The trigger's satellites are whichever reactions AREN'T the active one
  // (already shown as the hero) — same exclusion MobileReactionBadge uses.
  const mobileRestReactions = MOBILE_REACTIONS.filter(
    (t) => t !== mobileActive,
  );
  const mobileOrbitPos = mobileOrbitPositions(mobileRestReactions.length);

  const handleMobilePick = (type: ReactionType) => {
    if (!requireAuth("react to gists")) return;
    if (mobileActive === type) {
      setMobileDelta((p) => ({ ...p, [type]: (p[type] ?? 0) - 1 }));
      setMobileActive(null);
      handleUnreact();
    } else {
      // Date.now() here is just a unique key for the burst animation (see
      // GistCard's own identical use for the same purpose) — genuinely
      // fine to call from an event handler, the compiler's purity check is
      // just conservative about it regardless of call site.
      // eslint-disable-next-line react-hooks/purity
      const burstId = Date.now();
      setMobileDelta((p) => ({
        ...p,
        ...(mobileActive ? { [mobileActive]: (p[mobileActive] ?? 0) - 1 } : {}),
        [type]: (p[type] ?? 0) + 1,
      }));
      setMobileActive(type);
      handleReact(type);
      setCenterBurst({ id: burstId, type });
    }
    setMobilePickerOpen(false);
  };

  // Double-tap (see handleDoubleTapReact above) only ever drives
  // ReactionButton's externalTrigger prop on desktop — that component
  // isn't mounted on mobile at all, so this mirrors the same sync for the
  // picker's own local state here. Guarded to mobile only: without that,
  // this would ALSO fire alongside ReactionButton's own identical
  // externalTrigger effect on desktop, double-submitting the same react.
  useEffect(() => {
    if (!isMobile || !reactTrigger) return;
    if (mobileActive === reactTrigger.type) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileDelta((p) => ({
      ...p,
      ...(mobileActive ? { [mobileActive]: (p[mobileActive] ?? 0) - 1 } : {}),
      [reactTrigger.type]: (p[reactTrigger.type] ?? 0) + 1,
    }));
    setMobileActive(reactTrigger.type);
    handleReact(reactTrigger.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactTrigger, isMobile]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/gist/${gist.gist_id}`
      : `/gist/${gist.gist_id}`;
  const SHARE_CAPTION_LIMIT = 200;
  const shareCaption =
    gist.gist_text.length > SHARE_CAPTION_LIMIT
      ? `${gist.gist_text.slice(0, SHARE_CAPTION_LIMIT).trimEnd()}…`
      : gist.gist_text;
  const shareText = `${shareCaption}\n\n${shareUrl}`;

  const handleShare = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: shareText });
        shareGist(gist.gist_id, "native");
        return;
      }
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

  useEffect(() => {
    if (!showActions) return;
    const onClick = (e: MouseEvent) => {
      if (
        actionsRef.current &&
        !actionsRef.current.contains(e.target as Node)
      ) {
        setShowActions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showActions]);

  // Same "click outside closes it" pattern as the actions menu above — the
  // reaction picker's own backdrop already closes it for a tap anywhere
  // WITHIN this card, but with many of these cards in a list, tapping a
  // DIFFERENT card's trigger is a click entirely outside this one's own
  // DOM, which the backdrop alone never sees. Without this, opening a
  // second card's picker left the first one's still open underneath.
  useEffect(() => {
    if (!mobilePickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMobilePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [mobilePickerOpen]);

  // Same reachable-only-via-a-shared-link exception as GistCard — see its
  // own comment. Kept here too since this card can render a REJECTED gist
  // the exact same way if this list is ever reused somewhere that exception
  // applies.
  if (gist.gist_status === "REJECTED") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[26px] border border-line bg-surface-2 p-8 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <FlagIconFill size={24} weight="fill" />
        </div>
        <p className="font-nunito text-sm font-semibold text-ink">
          This gist has been removed
        </p>
        <p className="max-w-xs font-nunito text-xs text-muted">
          It went against Kampos&apos; community guidelines.
        </p>
      </div>
    );
  }

  return (
    // border + shadow (not just the feed card's own faint inset highlight)
    // — surface-2 (#fff) sits only a hair off surface (#fcfcff) in light
    // mode, invisible on its own with nothing else on the page to break it
    // up the way the feed's full-bleed stack card has. Dark mode's two
    // tokens are already far enough apart that this isn't an issue there,
    // but the border/shadow read fine either way, so no dark: override.
    <div
      ref={cardRef}
      className="relative rounded-[26px] border border-line bg-surface-2 shadow-sm"
    >
      {/* Header — just the timestamp + menu, not the poster's identity
          again (see the component doc comment above). */}
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="font-nunito text-xs font-semibold text-faint md:text-[13px]">
          {friendlyDateTime(gist.created_at)}
        </span>

        <div ref={actionsRef} className="relative z-20 shrink-0">
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
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Body — a plain tap does nothing (no navigation), double-tap
          reacts. Text first, media (if any) below it. */}
      <div onClick={handleDoubleTapReact} className="relative px-4 pt-2.5">
        {short ? (
          <ShortGist
            text={gist.gist_text}
            colorKey={gist.color_key}
            fallbackSeed={gist.gist_id}
          />
        ) : (
          gist.gist_text && <ExpandableText text={gist.gist_text} />
        )}

        {hasMedia && (
          <MediaBlock
            media={gist.media!}
            onOpenOverlay={(index) => {
              setOverlayStartTime(videoSyncRef.current?.getCurrentTime() ?? 0);
              setOverlayIndex(index);
            }}
            overlayOpen={overlayIndex !== null}
            videoSyncRef={videoSyncRef}
          />
        )}

        <AnimatePresence>
          {centerBurst && (
            <motion.div
              key={centerBurst.id}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 0.9] }}
              transition={{
                duration: 0.9,
                times: [0, 0.25, 0.7, 1],
                ease: "easeOut",
              }}
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

      {/* Footer — date/reactions/views/shares on the left (flex-nowrap +
          this cluster's own overflow-x-auto mirrors GistCard's own footer:
          on the narrowest phones, letting stats scroll keeps the row on the
          right from ever being squeezed or wrapped onto its own line), the
          reaction row plus the comment toggle on the right. Comments moved
          OUT of this stats cluster into their own button — it's not just a
          count here, it's what opens/closes the desktop comment panel (see
          ProfileView), so it needs to be a real tappable target, not a
          plain stat. */}
      <div className="relative mt-2 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1 border-t border-line/40 px-4 pb-3.5 pt-2.5">
        <div className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-faint">
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs md:text-[13px]">
            <ReactionIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.reactions_count)}
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
        <div className="flex shrink-0 items-center gap-2">
          {isMobile ? (
            // Exact copy of MobileReactionBadge's resting look (hero +
            // orbiting satellites) — see the MOBILE_HERO_SIZE/etc constants
            // above. Only what tapping the hero opens differs (the
            // centered-on-card picker above, not an upward tray).
            <div
              className="relative shrink-0"
              style={{
                width: MOBILE_ORBIT_RADIUS * 2 + MOBILE_SATELLITE_SIZE,
                height: MOBILE_ORBIT_RADIUS * 2 + MOBILE_SATELLITE_SIZE,
              }}
            >
              {mobileRestReactions.map((type, i) => (
                <div
                  key={type}
                  className="absolute flex items-center justify-center rounded-full bg-surface-2 shadow-sm shadow-black/10 ring-1 ring-line/60"
                  style={{
                    height: MOBILE_SATELLITE_SIZE,
                    width: MOBILE_SATELLITE_SIZE,
                    left: `calc(50% + ${mobileOrbitPos[i].x}px)`,
                    top: `calc(50% + ${mobileOrbitPos[i].y}px)`,
                    transform: "translate(-50%, -50%)",
                    zIndex: 10,
                  }}
                >
                  <Lottie
                    animationData={REACTION_ANIMATIONS[type]}
                    loop={false}
                    autoplay={false}
                    className="h-4 w-4"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setMobilePickerOpen((v) => !v)}
                aria-label="React to this gist"
                aria-expanded={mobilePickerOpen}
                className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface-2 shadow-md shadow-black/15 ring-2 ring-brand/40 transition-transform active:scale-95"
                style={{
                  height: MOBILE_HERO_SIZE,
                  width: MOBILE_HERO_SIZE,
                  zIndex: 20,
                }}
              >
                <motion.span
                  key={mobileActive ?? "none"}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  className="flex items-center justify-center"
                >
                  {mobileActive ? (
                    <Lottie
                      animationData={REACTION_ANIMATIONS[mobileActive]}
                      loop={false}
                      autoplay={false}
                      className="h-5 w-5"
                    />
                  ) : (
                    <ReactionIconFill
                      className="h-4 w-4 text-faint"
                      weight="regular"
                    />
                  )}
                </motion.span>
              </button>
            </div>
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
          {/* Same solid brand-filled look as the feed's own mobile
              icon+count comment trigger (FeedContent.tsx) — icon and count
              side by side here instead of stacked, since this sits in a
              row next to the reactions rather than alone in a bottom bar.
              The extra ring when `active` is the only cue that this
              specific gist is the one currently showing in the panel — the
              button itself looks the same whether the panel is open on a
              DIFFERENT gist or closed entirely, on purpose: what matters
              here is "is it open for THIS one," not "is it open at all". */}
          <button
            type="button"
            onClick={onToggleComments}
            aria-label={active ? "Hide comments" : "View comments"}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-1 rounded-full bg-brand px-2.5 py-1.5 text-white shadow-sm shadow-brand/30 transition ${
              active ? "ring-2 ring-brand-accent" : ""
            }`}
          >
            <CommentIconFill className="h-3.5 w-3.5" weight="fill" />
            <span className="font-nunito text-[11px] font-bold leading-none tabular-nums">
              {compactNumber(gist.counts?.comments_count)}
            </span>
          </button>
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
      <ErrorModal
        open={!!reportError}
        onClose={() => setReportError(undefined)}
        message={reportError}
      />
      <ErrorModal
        open={!!deleteError}
        onClose={() => setDeleteError(undefined)}
        message={deleteError}
      />
      <ErrorModal
        open={!!reactError}
        onClose={() => setReactError(undefined)}
        message={reactError}
      />

      {/* Mobile reaction picker — a sibling of the header/body/footer here
          (not nested inside the body, where it used to live) specifically
          so `absolute inset-0` resolves against the CARD's own bounds, not
          just the body's — the dimmed backdrop needs to cover the whole
          card (header + footer included), not leave the timestamp/menu row
          and the footer itself sitting uncovered above and below it. Not
          pointer-events-none like centerBurst — this one's interactive.
          Tapping the dimmed backdrop (not one of the 5 buttons) closes it
          without reacting. */}
      <AnimatePresence>
        {mobilePickerOpen && (
          <motion.div
            key="mobile-reaction-picker"
            className="absolute inset-0 z-30 flex items-center justify-center gap-3 rounded-[26px] bg-black/55 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setMobilePickerOpen(false)}
          >
            {MOBILE_REACTIONS.map((type, i) => {
              const isActive = type === mobileActive;
              const count = mobileCountFor(type);
              return (
                <motion.button
                  key={type}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMobilePick(type);
                  }}
                  aria-label={type}
                  aria-pressed={isActive}
                  initial={{ opacity: 0, y: 10, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.5 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 22,
                    delay: i * 0.03,
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 shadow-lg shadow-black/25 ring-2 ${
                      isActive ? "ring-brand" : "ring-white/20"
                    }`}
                  >
                    <Lottie
                      animationData={REACTION_ANIMATIONS[type]}
                      loop
                      autoplay
                      className="h-6 w-6"
                    />
                  </span>
                  {count > 0 && (
                    <span className="font-nunito text-[10px] font-bold text-white">
                      {compactNumber(count)}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hasMedia && overlayIndex !== null && (
          <GistMediaOverlay
            media={gist.media!}
            startIndex={overlayIndex}
            startTime={overlayStartTime}
            onClose={(currentTime) => {
              if (currentTime !== undefined && videoSyncRef.current) {
                videoSyncRef.current.seek(currentTime);
              }
              setOverlayIndex(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Long text clamps to a handful of lines with a "…more" — tapping it
 * expands in place and stays open (no "show less"), same convention
 * Twitter/Threads use. Reused for BOTH a text-only long gist AND the
 * caption above a media gist — same threshold (SHORT_TEXT) GistCard
 * already uses to decide "does this need truncating" at all.
 */
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp = text.length >= SHORT_TEXT;

  return (
    <div className="min-w-0">
      <p
        className={`whitespace-pre-wrap break-words font-nunito text-[15px] leading-relaxed text-ink md:text-lg ${
          needsClamp && !expanded ? "line-clamp-5" : ""
        }`}
      >
        {text}
      </p>
      {needsClamp && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 font-nunito text-[13px] font-bold text-brand-accent md:text-sm"
        >
          …more
        </button>
      )}
    </div>
  );
}

/**
 * Media, Twitter-style: below the text, not behind it. One item (photo or
 * video) keeps its real proportions, capped at 420px tall so an extreme
 * panorama or portrait can't take over the list; two sit side by side,
 * cropped into equal tiles — without real width/height on the gist payload
 * there's no way to balance two different natural ratios into one clean
 * row the way Twitter itself does, so this falls back to the feed's own
 * crop approach instead, just arranged horizontally rather than stacked.
 */
function MediaBlock({
  media,
  onOpenOverlay,
  overlayOpen,
  videoSyncRef,
}: {
  media: GistMedia[];
  onOpenOverlay: (index: number) => void;
  overlayOpen: boolean;
  videoSyncRef: React.RefObject<{
    getCurrentTime: () => number;
    seek: (time: number) => void;
  } | null>;
}) {
  const items = media.slice(0, 2);
  const isDuo = items.length === 2;

  return (
    <div
      data-media-block
      className={`mt-2.5 ${isDuo ? "flex aspect-[4/3] w-full gap-1" : ""}`}
    >
      {isDuo ? (
        items.map((item, idx) => (
          <div
            key={item.media_id}
            className="relative h-full flex-1 overflow-hidden rounded-2xl"
          >
            <MediaTile
              item={item}
              cropped
              onOpenOverlay={() => onOpenOverlay(idx)}
              overlayOpen={overlayOpen}
              videoSyncRef={videoSyncRef}
            />
          </div>
        ))
      ) : (
        <MediaTile
          item={items[0]}
          cropped={false}
          onOpenOverlay={() => onOpenOverlay(0)}
          overlayOpen={overlayOpen}
          videoSyncRef={videoSyncRef}
        />
      )}
    </div>
  );
}

/** width/height are only ever present on media uploaded through Cloudinary
 * (see the backend's finalize/upload/create handlers) — null for anything
 * older, or attached by URL rather than uploaded (a GIF/sticker). */
function knownRatio(item: GistMedia): number | null {
  return typeof item.width === "number" &&
    typeof item.height === "number" &&
    item.height > 0
    ? item.width / item.height
    : null;
}

function MediaTile({
  item,
  cropped,
  onOpenOverlay,
  overlayOpen,
  videoSyncRef,
}: {
  item: GistMedia;
  cropped: boolean;
  onOpenOverlay: () => void;
  overlayOpen: boolean;
  videoSyncRef: React.RefObject<{
    getCurrentTime: () => number;
    seek: (time: number) => void;
  } | null>;
}) {
  const isVideo = item.media_type?.toLowerCase().includes("video");
  const known = knownRatio(item);
  const [measuredExtreme, setMeasuredExtreme] = useState(false);
  // A known ratio decides this immediately, synchronously, correctly —
  // nothing to measure. Only media missing it (see knownRatio) falls back
  // to reading the loaded element itself, which can only ever catch up
  // AFTER the first paint already guessed wrong.
  const extreme =
    known !== null ? known < EXTREME_ASPECT_RATIO : measuredExtreme;

  if (isVideo) {
    return (
      <VideoTile
        item={item}
        cropped={cropped}
        onOpenOverlay={onOpenOverlay}
        overlayOpen={overlayOpen}
        videoSyncRef={videoSyncRef}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cloudinarySmartCrop(item.media_url)}
      alt=""
      onClick={onOpenOverlay}
      onLoad={
        cropped || known !== null
          ? undefined
          : (e) => {
              const img = e.currentTarget;
              if (img.naturalWidth / img.naturalHeight < EXTREME_ASPECT_RATIO)
                setMeasuredExtreme(true);
            }
      }
      draggable={false}
      // When the real ratio is already known, it drives sizing directly via
      // CSS `aspect-ratio` instead of waiting on the browser to decode the
      // image itself — for a photo that's rarely a visible difference, but
      // using the exact same mechanism VideoTile relies on (see its own
      // note) means one code path, not two subtly different ones.
      style={
        {
          WebkitUserDrag: "none",
          ...(known !== null && !extreme ? { aspectRatio: known } : {}),
        } as React.CSSProperties
      }
      className={
        cropped
          ? "h-full w-full cursor-pointer rounded-2xl object-cover object-top"
          : extreme
            ? "aspect-[3/4] max-h-[420px] w-full cursor-pointer rounded-2xl object-cover object-top"
            : "block w-full max-h-[420px] cursor-pointer rounded-2xl object-cover object-top"
      }
    />
  );
}

/**
 * Tap-to-play with mute/unmute control — tapping the video itself toggles
 * play/pause (same as the feed's own tiles), and a dedicated mute button
 * sits next to the play/pause button. Starts muted (browsers block
 * autoplay-with-sound anyway, and a muted start is less jarring in a
 * scrolling list). Expand opens the same GistMediaOverlay the feed uses.
 */
function VideoTile({
  item,
  cropped,
  onOpenOverlay,
  overlayOpen,
  videoSyncRef,
}: {
  item: GistMedia;
  cropped: boolean;
  onOpenOverlay: () => void;
  overlayOpen: boolean;
  videoSyncRef: React.RefObject<{
    getCurrentTime: () => number;
    seek: (time: number) => void;
  } | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const known = knownRatio(item);
  const [measuredExtreme, setMeasuredExtreme] = useState(false);
  const extreme =
    known !== null ? known < EXTREME_ASPECT_RATIO : measuredExtreme;

  // Populate the sync ref so the parent (ProfileGistCard) can read the
  // current playback position when opening the overlay and seek the
  // in-card video when the overlay closes — seamless handoff.
  useEffect(() => {
    videoSyncRef.current = {
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      seek: (time: number) => {
        if (videoRef.current) videoRef.current.currentTime = time;
      },
    };
    return () => {
      videoSyncRef.current = null;
    };
  }, [videoSyncRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => {});
    else video.pause();
  }, [playing]);

  // Pause the in-card video when the overlay opens — two copies of the
  // same video (and audio) playing at once makes no sense. The overlay's
  // own video takes over; when it closes, the in-card video stays paused
  // until the user taps play or scrolls away and back.
  useEffect(() => {
    if (overlayOpen) setPlaying(false);
  }, [overlayOpen]);

  // Autoplay when the video scrolls into view (muted — browsers block
  // autoplay-with-sound), pause when it scrolls out. Same pattern as the
  // feed's own swipe-stack: the "active" card's video plays, the rest
  // don't. The observer fires only when the element crosses the threshold
  // (not on every render), so a user manually pausing a video that's
  // still in view stays paused until the card leaves and re-enters view.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPlaying(true);
        } else {
          setPlaying(false);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={
        known !== null && !cropped && !extreme
          ? { aspectRatio: known }
          : undefined
      }
      className={
        cropped
          ? "relative h-full w-full"
          : extreme
            ? "relative aspect-[3/4] max-h-[420px] w-full"
            : "relative w-full max-h-[420px]"
      }
      onClick={() => setPlaying((p) => !p)}
    >
      <video
        ref={videoRef}
        src={item.media_url}
        poster={item.thumbnail_url}
        playsInline
        loop
        muted={muted}
        // Belt-and-suspenders for media that DOES have a known ratio (the
        // wrapper's own aspect-ratio above already sizes it correctly
        // regardless), and the only thing that helps at all for media that
        // doesn't: a <video> with a poster but no explicit preload defers
        // fetching its real dimensions until playback actually starts on
        // most browsers, which is what made an old, dimension-less tile
        // visibly resize the moment someone hit play.
        preload="metadata"
        onLoadedMetadata={
          cropped || known !== null
            ? undefined
            : (e) => {
                const video = e.currentTarget;
                if (video.videoWidth / video.videoHeight < EXTREME_ASPECT_RATIO)
                  setMeasuredExtreme(true);
              }
        }
        className="h-full w-full rounded-2xl object-cover object-top"
      />
      <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setPlaying((p) => !p);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          {playing ? (
            <PauseIconFill className="h-4 w-4" weight="fill" />
          ) : (
            <PlayIconFill className="h-4 w-4" weight="fill" />
          )}
        </button>
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          {muted ? (
            <MuteIconFill className="h-4 w-4" weight="fill" />
          ) : (
            <VolumeIconFill className="h-4 w-4" weight="fill" />
          )}
        </button>
      </div>
      <button
        type="button"
        aria-label="Expand"
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpenOverlay();
        }}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        <ExpandIconFill className="h-4 w-4" weight="duotone" />
      </button>
    </div>
  );
}
