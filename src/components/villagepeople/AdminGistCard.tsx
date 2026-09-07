"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ShortGist } from "@/components/gist/GistCard";
import { ExpandableText, MediaBlock, SHORT_TEXT } from "@/components/gist/GistMediaGrid";
import { GistMediaOverlay } from "@/components/gist/GistMediaOverlay";
import { ConfirmModal, ConfirmReasonModal, ErrorModal } from "@/components/ui/FeedbackModal";
import {
  Check,
  ReactionIconFill,
  CommentIconFill,
  ViewIconFill,
  ShareIconFill,
  DeleteIconFill,
} from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime, compactNumber } from "@/lib/format";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";
import { useAllGistsStore } from "@/stores/allGistsStore";
import { PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import type { AdminGist, AdminGistStatus } from "@/lib/serverGistsAdmin";
import { normalizeProfileType, type ReactionType } from "@/types";

const STATUS_BADGE: Record<AdminGistStatus, string> = {
  SUBMITTED: "bg-warning/15 text-warning",
  APPROVED: "bg-success/15 text-success",
  REJECTED: "bg-danger/15 text-danger",
};

const STATUS_LABEL: Record<AdminGistStatus, string> = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/**
 * Purpose-built admin card for /villagepeople/gists — deliberately NOT
 * ProfileGistCard or GistCard. ProfileGistCard/GistCard both hard-code an
 * early return that masks a REJECTED gist's real content behind a generic
 * "this gist has been removed" placeholder — exactly wrong here, where an
 * admin needs to actually see rejected content to judge it. Their action
 * menus are also built around "is this my own post" (edit/delete) vs
 * "report someone else's" — neither fits an admin, who needs approve/
 * reject/unapprove/delete regardless of ownership, with no reacting/
 * commenting/sharing/reporting-as-a-viewer at all.
 *
 * What IS reused, for visual consistency with everywhere else a gist
 * renders in this app: ShortGist + ExpandableText (from GistCard.tsx —
 * ShortGist is exported there, ExpandableText/MediaBlock/SHORT_TEXT live in
 * GistMediaGrid.tsx to avoid a circular import between the two, per that
 * file's own comment), MediaBlock + GistMediaOverlay (so an admin can still
 * open a bigger view of a photo/video, same as everywhere else — just
 * without any of the surrounding reaction/comment/report chrome), and
 * friendlyDateTime/compactNumber from lib/format.ts for the same
 * date/number formatting as the rest of the app.
 */
export function AdminGistCard({
  gist,
  active,
  onToggleComments,
  onChanged,
  onDeleted,
}: {
  gist: AdminGist;
  /** True while AllGistsManager's desktop comment panel (or the mobile
   * sheet) is open AND currently showing THIS gist — same "ring the button
   * so it's obvious which card the panel refers to" as ProfileGistCard's
   * own `active` prop. */
  active?: boolean;
  /** Fires when the comment button below is tapped — AllGistsManager owns
   * whether the panel/sheet is open and for which gist, same split as
   * ProfileGistCard's own onToggleComments. */
  onToggleComments?: () => void;
  /** Fires with the patched gist so the list can update this row's status
   * in place — the list (AllGistsManager) owns the array, not this card. */
  onChanged: (gist: AdminGist) => void;
  onDeleted: (gistId: string) => void;
}) {
  const router = useRouter();
  const approveGist = useAllGistsStore((s) => s.approveGist);
  const rejectGist = useAllGistsStore((s) => s.rejectGist);
  const deleteGist = useAllGistsStore((s) => s.deleteGist);

  const [busyAction, setBusyAction] = useState<"approve" | "reject" | "delete" | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);

  const hasMedia = !!gist.media && gist.media.length > 0;
  const short = (gist.gist_text?.length ?? 0) < SHORT_TEXT && !hasMedia;
  const isApproved = gist.gist_status === "APPROVED";
  const isRejected = gist.gist_status === "REJECTED";
  const busy = busyAction !== null;

  // Jumps straight to this poster's profile in the admin panel — reviewing
  // a gist is exactly when an admin most wants their history/status without
  // a detour through Profiles' own search. Falls back to no-op if
  // profile_type doesn't resolve to one of the 5 known types (shouldn't
  // happen for a real gist, same defensive posture as everywhere else this
  // session normalizes a profile_type before using it as a route segment).
  const normalizedType = normalizeProfileType(gist.profile_type);
  const goToProfile = () => {
    if (!normalizedType) return;
    router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH[normalizedType]}/${gist.avitag}`);
  };

  const handleApprove = async () => {
    setBusyAction("approve");
    try {
      const updated = await approveGist(gist.gist_id);
      onChanged({ ...gist, ...updated, gist_status: "APPROVED" });
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to approve this gist"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleReject = async (reason?: string) => {
    setBusyAction("reject");
    try {
      const updated = await rejectGist(gist.gist_id, reason);
      onChanged({ ...gist, ...updated, gist_status: "REJECTED" });
      setShowRejectConfirm(false);
    } catch (err) {
      setActionError(
        apiErrorMessage(err, isApproved ? "Failed to unapprove this gist" : "Failed to reject this gist"),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    setBusyAction("delete");
    try {
      await deleteGist(gist.gist_id);
      setShowDeleteConfirm(false);
      onDeleted(gist.gist_id);
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to delete this gist"));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[26px] border border-line bg-surface-2 p-4 shadow-sm">
      {/* Header — poster identity (Avatar wrapped in its own sized/ringed
          circle, same pattern every other admin list row already uses —
          NOT a size className handed straight to Avatar itself) + a status
          badge, since "which status is this" is the whole point of this
          screen. */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={goToProfile}
          disabled={!normalizedType}
          className="flex min-w-0 items-center gap-3 rounded-xl text-left transition enabled:hover:bg-brand/5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
            <Avatar src={gist.image_url} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-nunito text-sm font-semibold text-ink">
              {gist.display_name || `@${gist.avitag}`}
            </p>
            <p className="truncate font-nunito text-xs text-faint">
              @{gist.avitag} · {friendlyDateTime(gist.created_at)}
            </p>
          </div>
        </button>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 font-nunito text-[11px] font-bold ${
            STATUS_BADGE[gist.gist_status] ?? "bg-line/20 text-muted"
          }`}
        >
          {STATUS_LABEL[gist.gist_status] ?? gist.gist_status}
        </span>
      </div>

      {/* Body — the real content, including a REJECTED gist's, unlike
          ProfileGistCard/GistCard's masked placeholder (see doc comment
          above). */}
      <div>
        {short ? (
          <ShortGist text={gist.gist_text} colorKey={gist.color_key as string | null} fallbackSeed={gist.gist_id} />
        ) : (
          gist.gist_text && <ExpandableText text={gist.gist_text} />
        )}

        {hasMedia && (
          <MediaBlock media={gist.media!} onOpenOverlay={setOverlayIndex} overlayOpen={overlayIndex !== null} />
        )}
      </div>

      {/* Engagement row — reactions get a real per-type breakdown (same
          Lottie icons the consumer app reacts with, just at rest and
          non-clickable: an admin browsing shouldn't be reacting AS an
          admin), views/shares stay plain counts, and the comment button is
          genuinely interactive — it opens the same desktop panel/mobile
          sheet the consumer profile page uses (see AllGistsManager). */}
      <div className="flex items-center justify-between gap-3 border-t border-line/40 pt-2.5">
        <div className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-faint">
          {gist.reactions_by_type && Object.keys(gist.reactions_by_type).length > 0 ? (
            Object.entries(gist.reactions_by_type)
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <span key={type} className="flex shrink-0 items-center gap-1 font-nunito text-xs">
                  <Lottie
                    animationData={REACTION_ANIMATIONS[type as ReactionType]}
                    loop={false}
                    autoplay={false}
                    className="h-4 w-4"
                  />
                  {compactNumber(count)}
                </span>
              ))
          ) : (
            <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
              <ReactionIconFill size={14} weight="regular" />
              {compactNumber(gist.reactions_count)}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
            <ViewIconFill size={14} weight="regular" />
            {compactNumber(gist.views_count)}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-nunito text-xs">
            <ShareIconFill size={14} weight="regular" />
            {compactNumber(gist.shares_count)}
          </span>
        </div>
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
            {compactNumber(gist.comments_count)}
          </span>
        </button>
      </div>

      {/* Admin actions — approve/reject-or-unapprove/delete, regardless of
          who posted it. Approve is hidden once already APPROVED (nothing
          left to approve); Reject is disabled once already REJECTED
          (nothing left to reject) and relabeled "Unapprove" when the gist
          is currently live, since taking down a published post reads
          differently from rejecting a still-pending one even though it's
          the exact same underlying call. Delete is always available. */}
      <div className="flex flex-wrap gap-2 pt-1">
        {!isApproved && (
          <Button
            fullWidth={false}
            className="!px-5 !py-2 text-sm"
            loading={busyAction === "approve"}
            disabled={busy}
            onClick={handleApprove}
          >
            <Check className="h-4 w-4" />
            Approve
          </Button>
        )}
        <Button
          variant="secondary"
          fullWidth={false}
          className="!border-warning !px-5 !py-2 text-sm !text-warning hover:!bg-warning/10"
          disabled={busy || isRejected}
          onClick={() => setShowRejectConfirm(true)}
        >
          {isApproved ? "Unapprove" : "Reject"}
        </Button>
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
        open={showRejectConfirm}
        onClose={() => (busy ? undefined : setShowRejectConfirm(false))}
        onConfirm={handleReject}
        title={isApproved ? "Unapprove this gist?" : "Reject this gist?"}
        message={
          isApproved
            ? "It'll come down from the feed. You can add a reason for the record."
            : "It won't be published. You can add a reason for the record."
        }
        confirmLabel={isApproved ? "Unapprove" : "Reject"}
        loading={busyAction === "reject"}
      />
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => (busy ? undefined : setShowDeleteConfirm(false))}
        onConfirm={handleDelete}
        loading={busyAction === "delete"}
        title="Delete this gist?"
        message="This can't be undone — it'll be gone for everyone."
        confirmLabel="Delete"
        icon={<DeleteIconFill size={26} weight="fill" />}
      />
      <ErrorModal open={!!actionError} onClose={() => setActionError(undefined)} message={actionError} />

      <AnimatePresence>
        {hasMedia && overlayIndex !== null && (
          <GistMediaOverlay media={gist.media!} startIndex={overlayIndex} onClose={() => setOverlayIndex(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
