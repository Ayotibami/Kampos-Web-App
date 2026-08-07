"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";
import { Avatar } from "@/components/ui/Avatar";
import { GistMediaBackdrop, GistMediaBodyPanel } from "./GistMediaStage";
import { GistMediaOverlay } from "./GistMediaOverlay";
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
  CommentIconFill,
  ReactionIconFill,
  ViewIconFill,
  EditIconFill,
  DeleteIconFill,
} from "@/components/ui/icons";
import type { Gist, ReactionType } from "@/types";
import { gistColorFor } from "@/lib/brand";
import { timeAgo, friendlyDateTime, compactNumber } from "@/lib/format";

const SHORT_TEXT = 200;

/**
 * Text-length-driven size tiers for the hero statement block: a one-word gist
 * should hit like a bold headline, while a gist near the SHORT_TEXT limit
 * should still fit comfortably — ten tiers stepping down across the full
 * 0-200 range, with finer, smaller steps in the 100-200 zone (the riskiest
 * range for overflow: enough characters to wrap several lines, but not
 * enough length to justify a big font). Each tier stays responsive across
 * breakpoints; only the base tier changes with length.
 */
function heroTextSizeClass(length: number): string {
  if (length <= 10) return "text-4xl sm:text-5xl md:text-6xl";
  if (length <= 20) return "text-3xl sm:text-4xl md:text-5xl";
  if (length <= 32) return "text-2xl sm:text-3xl md:text-4xl";
  if (length <= 45) return "text-xl sm:text-2xl md:text-3xl";
  if (length <= 60) return "text-lg sm:text-xl md:text-2xl";
  if (length <= 80) return "text-base sm:text-lg md:text-xl";
  if (length <= 100) return "text-sm sm:text-base md:text-lg";
  if (length <= 130) return "text-sm sm:text-base md:text-base";
  if (length <= 165) return "text-xs sm:text-sm md:text-base";
  return "text-[11px] sm:text-xs md:text-sm";
}

/**
 * A single gist's content: profile header, engagement metrics, then either a
 * bold colored card (short text) or text + media (longer). Ported from the
 * mobile Gist component. Rendered inside the animated stack shell.
 */
export function GistCard({
  gist,
  isActive = true,
  onOverlayOpenChange,
  onDeleted,
  onEdited,
}: {
  gist: Gist;
  isActive?: boolean;
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

  const hasMedia = !!gist.media && gist.media.length > 0;
  // Lifted up (not local to the media panel) because the header/footer need
  // to know about it too — they switch to light text + let the backdrop show
  // through only while media mode is active.
  const [mediaMode, setMediaMode] = useState<"media" | "text">(hasMedia ? "media" : "text");
  // Which media item (if any) the bigger overlay view is currently open on —
  // separate from mediaMode, since the overlay is a distinct bigger view,
  // not a third state of the in-card body panel.
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);

  useEffect(() => {
    onOverlayOpenChange?.(overlayIndex !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayIndex]);

  const isOwn = gist.avitag === avitag;

  const handleReact = async (type: ReactionType) => {
    try {
      await reactGist(gist.gist_id, type);
    } catch (err) {
      // Surfaced now instead of silently swallowed — a failed react (most
      // commonly: not actually logged in) used to look successful in the
      // UI and then just vanish on reload with no explanation.
      setReactError(apiErrorMessage(err, "Failed to react — try again"));
    }
  };

  const handleUnreact = async () => {
    try {
      await unreactGist(gist.gist_id);
    } catch (err) {
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
        <p className="font-poppins text-sm font-semibold text-ink">This gist has been removed</p>
        <p className="max-w-xs font-poppins text-xs text-muted">
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
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
          <Avatar src={gist.image_url} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 shrink truncate font-poppins text-[13px] font-bold text-ink md:text-sm">
              {gist.first_name || gist.name || gist.avitag}
            </span>
            {isOwn && (
              <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 font-poppins text-[10px] font-bold leading-none text-brand md:text-[11px]">
                You
              </span>
            )}
            <span className="min-w-0 shrink truncate font-poppins text-[11px] text-faint md:text-xs">
              {gist.avitag}
            </span>
            <span className="shrink-0 font-poppins text-[11px] text-faint md:text-xs">
              · {timeAgo(gist.created_at)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {gist.campus_tag && <CampusTag>{gist.campus_tag}</CampusTag>}
            {gist.major_tag && <MajorTag>{gist.major_tag}</MajorTag>}
            {gist.level && <LevelTag>{gist.level}</LevelTag>}
          </div>
        </div>

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

      {/* Body — media (when present) is scoped to just this slot, not the
          whole card: the backdrop fills the body area only, header/footer
          stay in their normal card styling regardless of media mode.
          Double-tap-to-react listens here (text-only gists only — see
          handleDoubleTapReact), not on the whole card, so it stays scoped to
          the actual content rather than also catching taps on the header/
          footer chrome around it. */}
      <div
        onClick={!hasMedia ? handleDoubleTapReact : undefined}
        className="relative z-10 mt-4 min-h-0 flex-1 overflow-hidden"
      >
        {hasMedia ? (
          <>
            <GistMediaBackdrop
              media={gist.media!}
              blurred={mediaMode === "text"}
              active={isActive}
              overlayOpen={overlayIndex !== null}
              onTileClick={setOverlayIndex}
              onSwipeUp={() => setMediaMode("text")}
            />
            <GistMediaBodyPanel mode={mediaMode} onModeChange={setMediaMode} text={gist.gist_text} />
          </>
        ) : (
          <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-brand-dark/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-brand-dark/20 pr-1">
            {short ? (
              <ShortGist text={gist.gist_text} colorKey={gist.gist_id} />
            ) : (
              <p className="w-full whitespace-pre-wrap break-words font-poppins text-[15px] leading-relaxed text-ink text-justify">
                {gist.gist_text}
              </p>
            )}
          </div>
        )}

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

      {/* Actions & info — date first, then comments/reactions-total/views/shares
          (left, icon-only for space; date complements the relative time up in
          the header), then the reaction picker on the right. Share is
          display-only for now — the actual share action lands separately later. */}
      <div className="relative z-10 mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line/40 pt-1.5">
        <div className="flex items-center gap-3 text-faint">
          <span className="font-poppins text-[10px]">{friendlyDateTime(gist.created_at)}</span>
          <span className="flex items-center gap-1 font-poppins text-xs">
            <CommentIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.comments_count)}
          </span>
          <span className="flex items-center gap-1 font-poppins text-xs">
            <ReactionIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.reactions_count)}
          </span>
          <span className="flex items-center gap-1 font-poppins text-xs">
            <ViewIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.views_count)}
          </span>
          <span className="flex items-center gap-1 font-poppins text-xs">
            <ShareIconFill size={14} weight="regular" />
            {compactNumber(gist.counts?.shares_count)}
          </span>
        </div>
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
}

/** Circular icon button that pops out of the three-dot trigger — matches the
 * dot button's own resting look (soft brand tint, filling solid brand once
 * active/confirmed — same two states the dot button itself uses). Bounces on
 * tap via a springy overshoot, plus a quick expanding ring "ping" for extra
 * tactile feedback since there's no continuous loop to lean on. */
function PopActionButton({
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

// Uniform pill styling for all three (campus, major, level) — same shape,
// background, and color. Hierarchy comes only from font size and weight,
// stepping down from campus (largest/boldest) to level (smallest/lightest).
//
// Each tag also gets a subtle side-to-side sway every few seconds, staggered
// slightly (campus first, then major, then level) so the three ripple like a
// little dance instead of blinking in unison.
const TAG_BASE =
  "inline-block rounded-full bg-brand/10 px-2 py-0.5 font-poppins uppercase tracking-wide text-brand";

const TAG_DANCE = {
  animate: { x: [0, -3, 3, 0], rotate: [0, -3, 3, 0] },
  transition: { duration: 0.6, repeat: Infinity, repeatDelay: 3.4, ease: "easeInOut" as const },
};

function CampusTag({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      {...TAG_DANCE}
      transition={{ ...TAG_DANCE.transition, delay: 0 }}
      className={`${TAG_BASE} text-[9px] font-bold md:text-[10px]`}
    >
      {children}
    </motion.span>
  );
}

function MajorTag({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      {...TAG_DANCE}
      transition={{ ...TAG_DANCE.transition, delay: 0.15 }}
      className={`${TAG_BASE} text-[8px] font-semibold md:text-[9px]`}
    >
      {children}
    </motion.span>
  );
}

function LevelTag({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      {...TAG_DANCE}
      transition={{ ...TAG_DANCE.transition, delay: 0.3 }}
      className={`${TAG_BASE} text-[7px] font-medium md:text-[8px]`}
    >
      {children}
    </motion.span>
  );
}

/**
 * Short, text-only gists get a bold colored "hero" block that fills the card's
 * whole body (not just a floating minimum-height box), so it owns the frame
 * the way a quote card should. Text scales up on larger screens so a very
 * short gist doesn't read as a tiny caption lost in a big colored void.
 */
function ShortGist({ text, colorKey }: { text: string; colorKey: string }) {
  return (
    <div
      className="flex h-full min-h-[160px] w-full items-center justify-center overflow-hidden rounded-3xl p-4 text-left sm:p-5"
      style={{ backgroundColor: gistColorFor(colorKey) }}
    >
      <p className={`min-w-0 break-words font-nunito font-bold leading-snug text-white ${heroTextSizeClass(text.length)}`}>
        {text}
      </p>
    </div>
  );
}
