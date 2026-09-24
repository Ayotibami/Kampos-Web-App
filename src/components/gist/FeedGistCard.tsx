"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";
import { Avatar } from "@/components/ui/Avatar";
import { GistMediaOverlay } from "./GistMediaOverlay";
import { ShortGist, PopActionButton, RepostThreadLine } from "./GistCard";
import { ExpandableText, MediaBlock, SHORT_TEXT } from "./GistMediaGrid";
import { PollBlock } from "./PollBlock";
import { CampusTag, MajorTag, LevelTag } from "./GistTags";
import { ReactionButton } from "./ReactionButton";
import { ReportModal } from "./ReportModal";
import { ShareModal } from "./ShareModal";
import { ErrorModal, ConfirmModal } from "@/components/ui/FeedbackModal";
import { apiErrorMessage } from "@/lib/api";
import { useGistStore, isPendingGistId } from "@/stores/gistStore";
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
  AnonymousIconFill,
  RepostIconFill,
} from "@/components/ui/icons";
import type { Gist, ReactionType } from "@/types";
import { timeAgo, compactNumber } from "@/lib/format";
import { playSound } from "@/lib/sounds";

// Same controlled-dialog reasoning as ProfileGistCard/FeedContent's own
// dynamic() calls.
const CreateGistSheet = dynamic(() => import("./CreateGistSheet").then((m) => m.CreateGistSheet), {
  ssr: false,
});

const MOBILE_REACTIONS: ReactionType[] = [
  "LIKE",
  "LOVE",
  "FIRE",
  "SAD",
  "LAUGH",
];

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
 * A gist, laid out for the main feed's vertical scrolling list — same body/
 * footer as ProfileGistCard (react/edit/delete/report/share, the same
 * GistMediaOverlay, media sized to its own real proportions rather than
 * force-fit into a fixed swipe-stack slot), but WITH a real author header
 * (avatar/name/avitag/campus-major-level tags), since unlike the profile
 * page — where the poster's identity is already shown once, up top — the
 * feed mixes posters from many different people in the same list.
 *
 * Deliberately a new file rather than an edit to GistCard or ProfileGistCard:
 * neither the swipe-stack nor the profile page change at all. This is pure
 * addition, built by recombining pieces both of them already have —
 * GistCard's own author-header markup (richer than the admin panel's
 * equivalent — it already carries the campus/major/level tags and the "You"
 * badge) on top of ProfileGistCard's list-friendly body/footer/media-sizing.
 */
export const FeedGistCard = memo(function FeedGistCard({
  gist,
  showCampusTag = true,
  active,
  onToggleComments,
  onDeleted,
  onEdited,
  onReposted,
}: {
  gist: Gist;
  /** Suppresses just the campus chip — the feed passes false on the Gist/
   * School tabs (already scoped to one campus, the chip would be redundant)
   * and true on Amebo (mixed campuses, the chip is real information). Same
   * prop GistCard already has. */
  showCampusTag?: boolean;
  /** True while the desktop comment panel is open AND currently showing
   * this gist — lights up the comment button's own ring. */
  active?: boolean;
  /** Fires when the comment button is tapped — the feed owns whether the
   * panel is open at all and which gist it's showing, this card doesn't
   * track that itself. */
  onToggleComments?: () => void;
  onDeleted?: (gistId: string) => void;
  onEdited?: (gist: Gist) => void;
  /** Fires with the fresh Yarn back gist once it's actually posted — the
   * feed owns prepending it to what's visible, same reasoning as onEdited
   * splicing an edit in place rather than this card tracking its own
   * copy of the list. */
  onReposted?: (gist: Gist) => void;
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
  const [showYarnBack, setShowYarnBack] = useState(false);
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
  const hasPoll = !!gist.poll;
  const isOwn = gist.avitag === avitag;
  // A poll always gets the plain text treatment, never the colored hero
  // box — the question needs to read as a normal caption sitting above the
  // poll, not a big centered graphic competing with it for attention.
  const short = (gist.gist_text?.length ?? 0) < SHORT_TEXT && !hasMedia && !hasPoll;
  // Still sitting in the offline queue, not a real gist on the server yet.
  const isPending = isPendingGistId(gist.gist_id);

  // Double-tap-to-react — same 300ms window as the feed's swipe-stack card.
  // Excludes buttons/links AND anything inside the media block, which
  // already has its own tap meanings (open bigger / play-pause).
  const lastTapRef = useRef(0);
  const [reactTrigger, setReactTrigger] = useState<{
    type: ReactionType;
    nonce: number;
  } | null>(null);
  const [centerBurst, setCenterBurst] = useState<{
    id: number;
    type: ReactionType;
  } | null>(null);
  // Shared by handleDoubleTapReact below AND MediaBlock's own
  // onDoubleTapReact (see GistMediaGrid.tsx's useDelayedTapAction) — the
  // media block now detects its OWN double-tap internally (it has to, to
  // cancel its normal single-tap action first), but the actual "trigger a
  // LOVE" effect is the same either way, so it's factored out once instead
  // of duplicated.
  const triggerLoveReact = () => {
    const now = Date.now();
    if (!requireAuth("react to gists")) return;
    setReactTrigger({ type: "LOVE", nonce: now });
    setCenterBurst({ id: now, type: "LOVE" });
  };
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
      triggerLoveReact();
    } else {
      lastTapRef.current = now;
    }
  };

  const [localReaction, setLocalReaction] = useState<ReactionType | null>(
    gist.my_reaction ?? null,
  );
  const [reactionDelta, setReactionDelta] = useState(0);

  useEffect(() => {
    setLocalReaction(gist.my_reaction ?? null);
  }, [gist.my_reaction]);

  const prevReactionsCountRef = useRef(gist.counts?.reactions_count);
  if (prevReactionsCountRef.current !== gist.counts?.reactions_count) {
    prevReactionsCountRef.current = gist.counts?.reactions_count;
    if (reactionDelta !== 0) setReactionDelta(0);
  }

  const handleReact = async (type: ReactionType) => {
    if (isPending) {
      setReactError("Still saving — this'll be reactable once it's done posting.");
      return;
    }
    const isFirstReaction = localReaction === null;
    setLocalReaction(type);
    if (isFirstReaction) setReactionDelta((d) => d + 1);
    try {
      await reactGist(gist.gist_id, type);
      playSound("pop");
    } catch (err) {
      setLocalReaction(gist.my_reaction ?? null);
      if (isFirstReaction) setReactionDelta((d) => d - 1);
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
      setReactError(
        apiErrorMessage(err, "Failed to remove reaction — try again"),
      );
    }
  };

  const isMobile = useIsMobile();
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [mobileActive, setMobileActive] = useState<ReactionType | null>(
    gist.my_reaction ?? null,
  );
  const [mobileDelta, setMobileDelta] = useState<
    Partial<Record<ReactionType, number>>
  >({});
  const prevReactionsByTypeRef = useRef(gist.counts?.reactions_by_type);
  if (prevReactionsByTypeRef.current !== gist.counts?.reactions_by_type) {
    const prevByType = prevReactionsByTypeRef.current;
    const nowByType = gist.counts?.reactions_by_type;
    prevReactionsByTypeRef.current = nowByType;
    let changed = false;
    const next: typeof mobileDelta = {};
    for (const type of MOBILE_REACTIONS) {
      const delta = mobileDelta[type];
      if (!delta) continue;
      if ((prevByType?.[type] ?? 0) === (nowByType?.[type] ?? 0)) {
        next[type] = delta;
      } else {
        changed = true;
      }
    }
    if (changed) setMobileDelta(next);
  }
  const mobileCountFor = (type: ReactionType) =>
    Math.max(
      0,
      (gist.counts?.reactions_by_type?.[type] ?? 0) + (mobileDelta[type] ?? 0),
    );
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
    if (isPending) {
      setReactError("Still saving — you can share this once it's done posting.");
      return;
    }
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
      playSound("delete");
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

  // Same reachable-only-via-a-shared-link exception GistCard/ProfileGistCard
  // both already carry — see either's own comment.
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
    <div
      ref={cardRef}
      className="relative rounded-[26px] border border-line bg-surface-2 shadow-sm"
    >
      {/* Header — the feed's own author identity (GistCard's header, not
          ProfileGistCard's bare timestamp): avatar/name/avitag/You-badge/
          timestamp, then campus/major/level tags on their own row, since
          this list mixes posters instead of sitting on one person's own
          profile. */}
      <div className="relative z-20 flex items-start gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* Anonymous: mask avatar, not a Link — the real avitag never
              reaches this component's props for anyone but the poster
              themselves (the backend already redacted it, see
              gist.repo.ts's redactIfAnonymous), so there's genuinely
              nothing here to link to for anyone else. Even for the poster's
              own view, a Link would be pointless (their own profile), so
              it's dropped unconditionally rather than only for other
              viewers. */}
          {gist.is_anonymous ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-ink ring-1 ring-line">
              <AnonymousIconFill className="h-5 w-5 text-white" />
            </div>
          ) : (
            <Link
              href={`/${gist.avitag}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line"
            >
              <Avatar src={gist.image_url} />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              {gist.is_anonymous ? (
                <span className="min-w-0 shrink truncate font-nunito text-sm font-bold text-ink md:text-[15px]">
                  Anonymous
                </span>
              ) : (
                <Link
                  href={`/${gist.avitag}`}
                  className="min-w-0 shrink truncate font-nunito text-sm font-bold text-ink md:text-[15px]"
                >
                  {gist.first_name || gist.name || gist.avitag}
                </Link>
              )}
              {isOwn && (
                <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 font-nunito text-[10px] font-bold leading-none text-brand md:text-[11px]">
                  You
                </span>
              )}
              {/* No @avitag row for an anonymous post — there's no handle
                  to show, and one sitting next to "Anonymous" would be
                  self-defeating. */}
              {!gist.is_anonymous && (
                <Link
                  href={`/${gist.avitag}`}
                  className="min-w-0 shrink truncate font-nunito text-xs text-faint md:text-[13px]"
                >
                  {gist.avitag}
                </Link>
              )}
              <span className="shrink-0 font-nunito text-xs text-faint md:text-[13px]">
                · {timeAgo(gist.created_at)}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {showCampusTag && gist.campus_tag && <CampusTag>{gist.campus_tag}</CampusTag>}
              {/* Major/level dropped for an anonymous post — a campus is a
                  whole school, not identifying on its own, but "300L EEE"
                  narrows a small department down to a handful of real
                  people. */}
              {!gist.is_anonymous && gist.major_tag && <MajorTag>{gist.major_tag}</MajorTag>}
              {!gist.is_anonymous && gist.level && <LevelTag>{gist.level}</LevelTag>}
            </div>
          </div>
        </div>

        {isPending && (
          <span className="mt-1.5 shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 font-nunito text-[10px] font-bold leading-none text-warning md:text-[11px]">
            Pending
          </span>
        )}

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
          reacts. Text first, media (if any) below it, at its own real
          proportions (see MediaBlock's own callers for the difference —
          no fitHeightPx/stackDuo/active passed here). */}
      <div
        onClick={handleDoubleTapReact}
        className={gist.quoted_gist_id ? "relative pt-2.5" : "relative px-4 pt-2.5"}
      >
        {(() => {
          const content = (
            <>
              {short ? (
                <ShortGist
                  text={gist.gist_text}
                  colorKey={gist.color_key}
                  fallbackSeed={gist.gist_id}
                />
              ) : (
                gist.gist_text && <ExpandableText text={gist.gist_text} />
              )}

              {hasPoll && <PollBlock gistId={gist.gist_id} poll={gist.poll!} />}

              {hasMedia && (
                <MediaBlock
                  media={gist.media!}
                  onOpenOverlay={(index) => {
                    setOverlayStartTime(videoSyncRef.current?.getCurrentTime() ?? 0);
                    setOverlayIndex(index);
                  }}
                  overlayOpen={overlayIndex !== null}
                  videoSyncRef={videoSyncRef}
                  onDoubleTapReact={triggerLoveReact}
                />
              )}
            </>
          );
          // Reposts get the reply-thread treatment — a line continuing
          // down from the header avatar to the quoted poster's own
          // avatar (see RepostThreadLine's own doc for why it renders
          // that row itself instead of taking it as a child). A plain
          // gist skips this entirely, unchanged.
          return gist.quoted_gist_id ? (
            <RepostThreadLine quotedGist={gist.quoted_gist ?? null}>{content}</RepostThreadLine>
          ) : (
            content
          );
        })()}

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

      {/* Footer — stats on the left, reaction control + comment toggle on
          the right. Same layout ProfileGistCard already uses. */}
      <div className="relative mt-2 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1 border-t border-line/40 px-4 pb-3.5 pt-2.5">
        <div className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-faint">
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!requireAuth("yarn back gists")) return;
              setShowYarnBack(true);
            }}
            aria-label="Yarn back this gist"
            className="flex shrink-0 items-center gap-1 rounded-full bg-brand px-2.5 py-1.5 text-white shadow-sm shadow-brand/30 transition"
          >
            <RepostIconFill className="h-3.5 w-3.5" weight="fill" />
            {!!gist.counts?.reposts_count && (
              <span className="font-nunito text-[11px] font-bold leading-none tabular-nums">
                {compactNumber(gist.counts.reposts_count)}
              </span>
            )}
          </button>
          {isMobile ? (
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
            {!!gist.counts?.comments_count && (
              <span className="font-nunito text-[11px] font-bold leading-none tabular-nums">
                {compactNumber(gist.counts.comments_count)}
              </span>
            )}
          </button>
        </div>
      </div>

      <CreateGistSheet
        open={showEdit}
        onClose={() => setShowEdit(false)}
        editGist={gist}
        onPosted={(fresh) => onEdited?.(fresh)}
      />

      <CreateGistSheet
        open={showYarnBack}
        onClose={() => setShowYarnBack(false)}
        quoteGist={gist}
        onPosted={(fresh) => onReposted?.(fresh)}
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
