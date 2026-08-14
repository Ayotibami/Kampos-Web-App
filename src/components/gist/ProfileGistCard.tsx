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
} from "@/components/ui/icons";
import type { Gist, GistMedia, ReactionType } from "@/types";
import { cloudinarySmartCrop } from "@/lib/cloudinary";
import { timeAgo, friendlyDateTime, compactNumber } from "@/lib/format";

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
  onDeleted,
  onEdited,
}: {
  gist: Gist;
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
  const actionsRef = useRef<HTMLDivElement>(null);

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
  const [reactTrigger, setReactTrigger] = useState<{ type: ReactionType; nonce: number } | null>(null);
  const [centerBurst, setCenterBurst] = useState<{ id: number; type: ReactionType } | null>(null);
  const handleDoubleTapReact = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea, [data-media-block]")) return;
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
      setReactError(apiErrorMessage(err, "Failed to remove reaction — try again"));
    }
  };

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/gist/${gist.gist_id}` : `/gist/${gist.gist_id}`;
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
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showActions]);

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
        <p className="font-nunito text-sm font-semibold text-ink">This gist has been removed</p>
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
    <div className="relative rounded-[26px] border border-line bg-surface-2 shadow-sm">
      {/* Header — just the timestamp + menu, not the poster's identity
          again (see the component doc comment above). */}
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="font-nunito text-xs font-semibold text-faint md:text-[13px]">{timeAgo(gist.created_at)}</span>

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
                <PopActionButton label="Share" onClick={handleShare} icon={<ShareIconFill size={17} weight="fill" />} />
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
          <ShortGist text={gist.gist_text} colorKey={gist.color_key} fallbackSeed={gist.gist_id} />
        ) : (
          gist.gist_text && <ExpandableText text={gist.gist_text} />
        )}

        {hasMedia && <MediaBlock media={gist.media!} onOpenOverlay={setOverlayIndex} />}

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

      {/* Footer — same stats the feed shows, plus comments (the feed
          deliberately hides it, since it's already visible elsewhere; a
          list preview is exactly where a glanceable comment count belongs)
          — and the same reaction row the feed already uses on desktop, now
          on mobile too. flex-nowrap + the stats cluster's own
          overflow-x-auto mirrors GistCard's own footer for the same
          reason: on the narrowest phones, letting stats scroll keeps the
          reaction row from ever being squeezed or wrapped onto its own
          line. */}
      <div className="relative mt-2 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1 border-t border-line/40 px-4 pb-3.5 pt-2.5">
        <div className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-faint">
          <span className="shrink-0 font-nunito text-xs md:text-[13px]">{friendlyDateTime(gist.created_at)}</span>
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
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs md:text-[13px]">
            <CommentIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.comments_count)}
          </span>
        </div>
        <div className="shrink-0">
          <ReactionButton
            onReact={handleReact}
            onUnreact={handleUnreact}
            counts={gist.counts?.reactions_by_type}
            initialActive={gist.my_reaction}
            externalTrigger={reactTrigger}
            onReacted={(type) => setCenterBurst({ id: Date.now(), type })}
            guardClick={() => requireAuth("react to gists")}
          />
        </div>
      </div>

      <CreateGistSheet open={showEdit} onClose={() => setShowEdit(false)} editGist={gist} onPosted={(fresh) => onEdited?.(fresh)} />

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete this gist?"
        message="This can't be undone — it'll be gone for everyone."
        confirmLabel="Delete"
      />

      <ReportModal open={showReportModal} onClose={() => setShowReportModal(false)} onSubmit={handleReport} loading={reporting} />
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
          <GistMediaOverlay media={gist.media!} startIndex={overlayIndex} onClose={() => setOverlayIndex(null)} />
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
function MediaBlock({ media, onOpenOverlay }: { media: GistMedia[]; onOpenOverlay: (index: number) => void }) {
  const items = media.slice(0, 2);
  const isDuo = items.length === 2;

  return (
    <div data-media-block className={`mt-2.5 ${isDuo ? "flex aspect-[4/3] w-full gap-1" : ""}`}>
      {isDuo
        ? items.map((item, idx) => (
            <div key={item.media_id} className="relative h-full flex-1 overflow-hidden rounded-2xl">
              <MediaTile item={item} cropped onOpenOverlay={() => onOpenOverlay(idx)} />
            </div>
          ))
        : <MediaTile item={items[0]} cropped={false} onOpenOverlay={() => onOpenOverlay(0)} />}
    </div>
  );
}

/** width/height are only ever present on media uploaded through Cloudinary
 * (see the backend's finalize/upload/create handlers) — null for anything
 * older, or attached by URL rather than uploaded (a GIF/sticker). */
function knownRatio(item: GistMedia): number | null {
  return typeof item.width === "number" && typeof item.height === "number" && item.height > 0
    ? item.width / item.height
    : null;
}

function MediaTile({ item, cropped, onOpenOverlay }: { item: GistMedia; cropped: boolean; onOpenOverlay: () => void }) {
  const isVideo = item.media_type?.toLowerCase().includes("video");
  const known = knownRatio(item);
  const [measuredExtreme, setMeasuredExtreme] = useState(false);
  // A known ratio decides this immediately, synchronously, correctly —
  // nothing to measure. Only media missing it (see knownRatio) falls back
  // to reading the loaded element itself, which can only ever catch up
  // AFTER the first paint already guessed wrong.
  const extreme = known !== null ? known < EXTREME_ASPECT_RATIO : measuredExtreme;

  if (isVideo) {
    return <VideoTile item={item} cropped={cropped} onOpenOverlay={onOpenOverlay} />;
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
              if (img.naturalWidth / img.naturalHeight < EXTREME_ASPECT_RATIO) setMeasuredExtreme(true);
            }
      }
      draggable={false}
      // When the real ratio is already known, it drives sizing directly via
      // CSS `aspect-ratio` instead of waiting on the browser to decode the
      // image itself — for a photo that's rarely a visible difference, but
      // using the exact same mechanism VideoTile relies on (see its own
      // note) means one code path, not two subtly different ones.
      style={{
        WebkitUserDrag: "none",
        ...(known !== null && !extreme ? { aspectRatio: known } : {}),
      } as React.CSSProperties}
      className={
        cropped
          ? "h-full w-full cursor-pointer rounded-2xl object-cover object-top"
          : extreme
            ? "aspect-[3/4] max-h-[420px] w-full cursor-pointer rounded-2xl object-cover object-top"
            : "block max-h-[420px] w-auto max-w-full cursor-pointer rounded-2xl"
      }
    />
  );
}

/**
 * No autoplay, no mute toggle — this tile never plays without a direct tap,
 * which is already real consent to hear it (same reasoning the feed uses
 * for its own non-lead, tap-to-play tiles), so there's nothing a separate
 * mute button would add. Just play/pause, and an explicit expand into the
 * same GistMediaOverlay the feed itself uses for its bigger view.
 */
function VideoTile({ item, cropped, onOpenOverlay }: { item: GistMedia; cropped: boolean; onOpenOverlay: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const known = knownRatio(item);
  const [measuredExtreme, setMeasuredExtreme] = useState(false);
  const extreme = known !== null ? known < EXTREME_ASPECT_RATIO : measuredExtreme;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => {});
    else video.pause();
  }, [playing]);

  // A list can hold several videos someone's pressed play on and then just
  // kept scrolling past — without this, every one of them keeps playing
  // (and, worse, keeps making sound) indefinitely in the background. Only
  // subscribes while actually playing — nothing to watch for once already
  // paused. Setting `playing` false here re-runs the effect above, which
  // pauses the real <video> element the same way the pause button does.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) setPlaying(false);
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [playing]);

  return (
    <div
      style={known !== null && !cropped && !extreme ? { aspectRatio: known } : undefined}
      className={
        cropped
          ? "relative h-full w-full"
          : extreme
            ? "relative aspect-[3/4] max-h-[420px] w-full"
            : known !== null
              ? "relative max-h-[420px] w-full"
              : "relative inline-block max-w-full"
      }
    >
      <video
        ref={videoRef}
        src={item.media_url}
        poster={item.thumbnail_url}
        playsInline
        loop
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
                if (video.videoWidth / video.videoHeight < EXTREME_ASPECT_RATIO) setMeasuredExtreme(true);
              }
        }
        className={
          cropped || extreme || known !== null
            ? "h-full w-full rounded-2xl object-cover object-top"
            : "block max-h-[420px] w-auto max-w-full rounded-2xl"
        }
      />
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => setPlaying((p) => !p)}
        className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        {playing ? <PauseIconFill className="h-4 w-4" weight="fill" /> : <PlayIconFill className="h-4 w-4" weight="fill" />}
      </button>
      <button
        type="button"
        aria-label="Expand"
        onClick={onOpenOverlay}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        <ExpandIconFill className="h-4 w-4" weight="duotone" />
      </button>
    </div>
  );
}
