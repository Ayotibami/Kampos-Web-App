"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmReasonModal, ErrorModal } from "@/components/ui/FeedbackModal";
import { AdminSpotVideoTile } from "./AdminSpotVideoTile";
import {
  Heart,
  CommentIconFill,
  ViewIconFill,
  ShareIconFill,
  FlagIconFill,
  EyeOff,
  DeleteIconFill,
} from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime, compactNumber } from "@/lib/format";
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
 * dense admin browse list or an admin's own actions. The video itself is
 * AdminSpotVideoTile — see that file's own doc comment for the autoplay-
 * on-scroll/mute/expand reasoning, shared with SpotReportsTab's rows too.
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
  const [actionError, setActionError] = useState<string>();

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

      {/* Body — a real, sizeable autoplaying video (see AdminSpotVideoTile's
          own doc comment) + caption. */}
      <div className="flex gap-3">
        <AdminSpotVideoTile mediaUrl={spot.media_url} thumbnailUrl={spot.thumbnail_url} />
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
          regardless. Icon-only on mobile (text back from sm: up), same
          compacting the admin profile pages already got — three buttons'
          worth of text pills was cramped on a narrow screen here too. */}
      <div className="flex flex-wrap gap-2 pt-1">
        {isRejected ? (
          <Button
            variant="secondary"
            fullWidth={false}
            aria-label="Reactivate"
            className="!px-3 !py-2 text-sm !border-success !text-success hover:!bg-success/10 sm:!px-5"
            loading={busy}
            disabled={busy}
            onClick={handleReactivate}
          >
            <ViewIconFill className="h-4 w-4" weight="fill" />
            <span className="hidden sm:inline">Reactivate</span>
          </Button>
        ) : (
          <Button
            variant="secondary"
            fullWidth={false}
            aria-label={isActive ? "Take Down" : STATUS_LABEL[spot.status]}
            className="!px-3 !py-2 text-sm !border-warning !text-warning hover:!bg-warning/10 sm:!px-5"
            disabled={busy || !isActive}
            onClick={() => setShowTakeDownConfirm(true)}
          >
            <EyeOff className="h-4 w-4" />
            <span className="hidden sm:inline">{isActive ? "Take Down" : STATUS_LABEL[spot.status]}</span>
          </Button>
        )}
        <Button
          variant="secondary"
          fullWidth={false}
          aria-label="Delete"
          className="!px-3 !py-2 text-sm !border-danger !text-danger hover:!bg-danger/5 sm:!px-5"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
        >
          <DeleteIconFill className="h-4 w-4" weight="fill" />
          <span className="hidden sm:inline">Delete</span>
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
    </div>
  );
}
