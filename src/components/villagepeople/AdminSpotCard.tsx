"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmReasonModal, ErrorModal } from "@/components/ui/FeedbackModal";
import {
  Heart,
  CommentIconFill,
  ViewIconFill,
  ShareIconFill,
  FlagIconFill,
  EyeOff,
  X,
  PlayIconFill,
  VolumeIconFill,
  MuteIconFill,
  ExpandIconFill,
  DeleteIconFill,
} from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime, compactNumber } from "@/lib/format";
import { cloudinaryVideo } from "@/lib/cloudinary";
import { useAllSpotsStore } from "@/stores/allSpotsStore";
import { PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import type { AdminSpot, AdminSpotStatus } from "@/lib/serverSpotsAdmin";
import { normalizeProfileType } from "@/types";

const STATUS_BADGE: Record<AdminSpotStatus, string> = {
  DRAFT: "bg-line/20 text-muted",
  ACTIVE: "bg-success/15 text-success",
  REJECTED: "bg-danger/15 text-danger",
  REMOVED: "bg-line/30 text-faint",
};

const STATUS_LABEL: Record<AdminSpotStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  REJECTED: "Taken down",
  REMOVED: "Removed by poster",
};

/**
 * Purpose-built admin card for /villagepeople/spots — same reasoning as
 * AdminGistCard's own doc comment: the consumer-facing VideoCard is built
 * for one autoplaying full-screen swipe-feed slot with an engagement rail
 * meant for a VIEWER (like/comment/share/report), none of which fits a
 * dense admin browse list or an admin's own actions. Video plays inline at
 * a real, sizeable box — big enough to actually review at a glance while
 * scrolling — muted, looping, and driven by an IntersectionObserver so it
 * only autoplays while this specific card is actually on screen (pauses the
 * instant it scrolls away, same "don't keep a dozen clips silently playing
 * at once" reasoning the consumer feed's own windowing follows, just via
 * play/pause here instead of unmounting). A small mute toggle sits on the
 * video itself for real audio without leaving the list; the expand icon
 * still opens VideoPreviewModal for a bigger, controls-based look.
 *
 * Spot has no approval queue (see spot.repo.ts's own migration comment —
 * it goes straight to ACTIVE on finalize), so unlike Gist's three-way
 * approve/reject/delete, there are three moderation actions here: Take Down
 * (soft — status flip to REJECTED), Reactivate (undoes a Take Down —
 * REJECTED back to ACTIVE, shown ONLY for REJECTED; never offered for
 * REMOVED, since that's the poster's own self-delete, not an admin action
 * to undo — see SpotRepo.reactivateAsAdmin's own doc), and Delete (hard —
 * a real DELETE FROM spots, mirrors Gist's own admin delete exactly,
 * always available regardless of current status since there's no "already
 * deleted" state short of the row being gone).
 */
export function AdminSpotCard({
  spot,
  onChanged,
  onDeleted,
}: {
  spot: AdminSpot;
  /** Fires with the patched spot so the list can update this row's status
   * in place — the list (AllSpotsManager) owns the array, not this card. */
  onChanged: (spot: AdminSpot) => void;
  /** Fires after a real hard delete succeeds, so the list can remove this
   * row entirely — unlike Take Down, there's no "patched" spot to show
   * afterward. */
  onDeleted: (spotId: string) => void;
}) {
  const router = useRouter();
  const takeDownSpot = useAllSpotsStore((s) => s.takeDownSpot);
  const hardDeleteSpot = useAllSpotsStore((s) => s.hardDeleteSpot);
  const reactivateSpot = useAllSpotsStore((s) => s.reactivateSpot);

  const [busy, setBusy] = useState(false);
  const [showTakeDownConfirm, setShowTakeDownConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Autoplay-on-scroll — plays this card's own video once it's
  // meaningfully on screen, pauses the moment it isn't. threshold: 0.5 (at
  // least half the clip visible) matches how "scrolled into view" reads
  // intuitively in a plain vertical list, not the consumer feed's stricter
  // 0.6 (that one gates which single card is "the" active one in a snap
  // feed; this just gates whether THIS card should be playing at all,
  // several of which could in principle be half-visible at once during a
  // fast scroll — each decides for itself).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !spot.media_url) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [spot.media_url]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  const isActive = spot.status === "ACTIVE";
  const isRejected = spot.status === "REJECTED";

  const normalizedType = normalizeProfileType(spot.profile_type);
  const goToProfile = () => {
    if (!normalizedType) return;
    router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH[normalizedType]}/${spot.avitag}`);
  };

  const handleTakeDown = async (reason?: string) => {
    setBusy(true);
    try {
      await takeDownSpot(spot.spot_id, reason);
      onChanged({ ...spot, status: "REJECTED" });
      setShowTakeDownConfirm(false);
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to take down this Spot"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (reason?: string) => {
    setBusy(true);
    try {
      await hardDeleteSpot(spot.spot_id, reason);
      setShowDeleteConfirm(false);
      onDeleted(spot.spot_id);
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to delete this Spot"));
    } finally {
      setBusy(false);
    }
  };

  // No confirm modal, same as Gist's own Approve button — undoing your own
  // takedown doesn't warrant the same "are you sure" friction as taking
  // something down or deleting it in the first place.
  const handleReactivate = async () => {
    setBusy(true);
    try {
      await reactivateSpot(spot.spot_id);
      onChanged({ ...spot, status: "ACTIVE" });
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to reactivate this Spot"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[26px] border border-line bg-surface-2 p-4 shadow-sm">
      {/* Header — same poster-identity + status-badge shape as AdminGistCard. */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={goToProfile}
          disabled={!normalizedType}
          className="flex min-w-0 items-center gap-3 rounded-xl text-left transition enabled:hover:bg-brand/5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
            <Avatar src={spot.image_url} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-nunito text-sm font-semibold text-ink">
              {spot.display_name || `@${spot.avitag}`}
            </p>
            <p className="truncate font-nunito text-xs text-faint">
              @{spot.avitag} · {friendlyDateTime(spot.created_at)}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 font-nunito text-[11px] font-bold ${
              STATUS_BADGE[spot.status] ?? "bg-line/20 text-muted"
            }`}
          >
            {STATUS_LABEL[spot.status] ?? spot.status}
          </span>
          {spot.is_reported && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 font-nunito text-[11px] font-bold text-danger">
              <FlagIconFill className="h-3 w-3" weight="fill" />
              Reported
            </span>
          )}
        </div>
      </div>

      {/* Body — a real, sizeable video (see this card's own doc comment for
          the autoplay-on-scroll/mute reasoning) + caption. */}
      <div className="flex gap-3">
        <div className="relative h-64 w-36 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-black/5">
          {spot.media_url ? (
            <video
              ref={videoRef}
              src={cloudinaryVideo(spot.media_url)}
              poster={spot.thumbnail_url ?? undefined}
              muted={muted}
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/20 to-brand/5">
              <PlayIconFill className="h-6 w-6 text-brand/50" weight="fill" />
            </div>
          )}
          {spot.media_url && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => !m);
                }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
              >
                {muted ? <MuteIconFill className="h-4 w-4" weight="fill" /> : <VolumeIconFill className="h-4 w-4" weight="fill" />}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                aria-label="Open a bigger preview"
                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
              >
                <ExpandIconFill className="h-4 w-4" weight="bold" />
              </button>
            </>
          )}
        </div>
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-nunito text-sm text-ink">
          {spot.caption || <span className="text-faint">No caption</span>}
        </p>
      </div>

      {/* Engagement row — plain counts, at rest (an admin browsing shouldn't
          be reacting as an admin). */}
      <div className="no-scrollbar flex items-center gap-3 overflow-x-auto border-t border-line/40 pt-2.5 text-faint">
        <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
          <Heart className="h-3.5 w-3.5" strokeWidth={1.8} />
          {compactNumber(spot.reactions_count)}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
          <CommentIconFill className="h-3.5 w-3.5" weight="regular" />
          {compactNumber(spot.comments_count)}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
          <ViewIconFill className="h-3.5 w-3.5" weight="regular" />
          {compactNumber(spot.views_count)}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
          <ShareIconFill className="h-3.5 w-3.5" weight="regular" />
          {compactNumber(spot.shares_count)}
        </span>
        {spot.reports_count > 0 && (
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs text-danger">
            <FlagIconFill className="h-3.5 w-3.5" weight="regular" />
            {compactNumber(spot.reports_count)}
          </span>
        )}
      </div>

      {/* Admin actions — see this card's own doc comment for the three-way
          split. REJECTED swaps the disabled status label for a real,
          enabled Reactivate button; DRAFT/REMOVED keep the plain disabled
          label (nothing to undo for either). Delete stays available
          regardless. */}
      <div className="flex flex-wrap gap-2 pt-1">
        {isRejected ? (
          <Button
            variant="secondary"
            fullWidth={false}
            className="!border-success !px-5 !py-2 text-sm !text-success hover:!bg-success/10"
            loading={busy}
            disabled={busy}
            onClick={handleReactivate}
          >
            <ViewIconFill className="h-4 w-4" weight="fill" />
            Reactivate
          </Button>
        ) : (
          <Button
            variant="secondary"
            fullWidth={false}
            className="!border-warning !px-5 !py-2 text-sm !text-warning hover:!bg-warning/10"
            disabled={busy || !isActive}
            onClick={() => setShowTakeDownConfirm(true)}
          >
            <EyeOff className="h-4 w-4" />
            {isActive ? "Take Down" : STATUS_LABEL[spot.status]}
          </Button>
        )}
        <Button
          variant="secondary"
          fullWidth={false}
          className="!border-danger !px-5 !py-2 text-sm !text-danger hover:!bg-danger/5"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
        >
          <DeleteIconFill className="h-4 w-4" weight="fill" />
          Delete
        </Button>
      </div>

      <ConfirmReasonModal
        open={showTakeDownConfirm}
        onClose={() => (busy ? undefined : setShowTakeDownConfirm(false))}
        onConfirm={handleTakeDown}
        title="Take down this Spot?"
        message="It'll come down from the feed and every profile grid. You can add a reason for the record."
        confirmLabel="Take Down"
        loading={busy}
      />
      <ConfirmReasonModal
        open={showDeleteConfirm}
        onClose={() => (busy ? undefined : setShowDeleteConfirm(false))}
        onConfirm={handleDelete}
        title="Delete this Spot?"
        message="This can't be undone — it's gone for everyone, along with its comments and report history. You can add a reason for the record."
        confirmLabel="Delete"
        loading={busy}
      />
      <ErrorModal open={!!actionError} onClose={() => setActionError(undefined)} message={actionError} />

      <VideoPreviewModal
        open={showPreview}
        src={spot.media_url}
        onClose={() => setShowPreview(false)}
      />
    </div>
  );
}

/** A real, controllable preview of the actual clip — same "an admin needs
 * to see the real thing to judge it" reasoning AdminGistCard's own
 * GistMediaOverlay reuse follows, just for video. Built directly on Modal
 * rather than reusing the consumer feed's VideoCard, which comes with an
 * entire swipe-feed/autoplay/mute-state apparatus this single-clip review
 * dialog has no use for. */
export function VideoPreviewModal({ open, src, onClose }: { open: boolean; src: string | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} className="relative flex max-h-[85vh] w-[min(92vw,420px)] items-center justify-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
      >
        <X className="h-4 w-4" />
      </button>
      {open && src && (
        <video
          src={cloudinaryVideo(src)}
          controls
          autoPlay
          playsInline
          className="max-h-[85vh] w-full rounded-2xl bg-black"
        />
      )}
    </Modal>
  );
}
