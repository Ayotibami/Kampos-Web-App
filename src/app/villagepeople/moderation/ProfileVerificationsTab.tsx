"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmReasonModal } from "@/components/ui/FeedbackModal";
import { apiErrorMessage } from "@/lib/api";
import { useModerationStore } from "@/stores/moderationStore";
import type { PendingProfile } from "@/lib/serverModeration";

const PAGE_SIZE = 20;

/** Title-cases a ProfileType value for display, e.g. "kompany" -> "Kompany". */
function profileTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Profile Verifications tab — approve (verify) / reject pending profiles
 * across all 5 profile types. Per the backend's intentional design, reject
 * here does NOT change the profile's own verification state — it only logs
 * an audit-log review, so the profile stays unverified and can resurface if
 * anyone reviews it again later. There is therefore nothing on the row
 * itself to update after a reject; this still removes the row from THIS
 * list optimistically (same "gone from the queue you just acted on" feel
 * approve gets) and shows a success toast that explicitly says the review
 * was logged, so the admin gets clear confirmation something happened even
 * though the row would otherwise look untouched.
 *
 * "Load more" re-fetches from offset 0 with a bigger limit — see
 * PendingPostsTab's identical comment / moderationStore.ts's fetchProfiles
 * for why a growing offset would silently skip items in a shrinking queue.
 */
export function ProfileVerificationsTab({
  initialProfiles,
  onFail,
  onSucceed,
  onCountChange,
}: {
  initialProfiles: PendingProfile[];
  onFail: (msg: string) => void;
  onSucceed: (msg: string) => void;
  /** See PendingPostsTab's identical prop for why this exists. */
  onCountChange?: (count: number) => void;
}) {
  const [profiles, setProfiles] = useState<PendingProfile[]>(initialProfiles);

  useEffect(() => {
    onCountChange?.(profiles.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingProfile | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [limit, setLimit] = useState(Math.max(PAGE_SIZE, initialProfiles.length));
  const [hasMore, setHasMore] = useState(initialProfiles.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const verifyProfile = useModerationStore((s) => s.verifyProfile);
  const rejectProfile = useModerationStore((s) => s.rejectProfile);
  const fetchProfiles = useModerationStore((s) => s.fetchProfiles);

  const removeProfile = (avitag: string) => setProfiles((prev) => prev.filter((p) => p.avitag !== avitag));

  const handleLoadMore = async () => {
    const nextLimit = limit + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const fresh = await fetchProfiles(nextLimit);
      setProfiles(fresh);
      setLimit(nextLimit);
      setHasMore(fresh.length >= nextLimit);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load more profiles"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleApprove = async (profile: PendingProfile) => {
    setActioningId(profile.avitag);
    try {
      await verifyProfile(profile.avitag);
      removeProfile(profile.avitag);
      onSucceed(`@${profile.avitag} is now verified.`);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to verify profile"));
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (reason?: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await rejectProfile(rejectTarget.avitag, reason);
      removeProfile(rejectTarget.avitag);
      setRejectTarget(null);
      onSucceed(`Review logged for @${rejectTarget.avitag} — it stays unverified.`);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to log profile review"));
    } finally {
      setRejecting(false);
    }
  };

  if (profiles.length === 0 && !hasMore) {
    return (
      <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
        No pending profile verifications.
      </p>
    );
  }

  return (
    <>
      <ConfirmReasonModal
        open={!!rejectTarget}
        onClose={() => (rejecting ? undefined : setRejectTarget(null))}
        onConfirm={handleReject}
        title="Reject this verification?"
        message="This just logs your review — the profile stays unverified either way. You can add a reason for the record."
        confirmLabel="Reject"
        loading={rejecting}
      />

      <ul className="flex flex-col gap-3">
        {profiles.map((profile) => {
          const busy = actioningId === profile.avitag;
          return (
            <li
              key={profile.avitag}
              className="flex items-center gap-3 rounded-2xl border border-line/70 p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
                <Avatar src={profile.image_url} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-nunito text-sm font-semibold text-ink">
                  {profile.display_name || `@${profile.avitag}`}
                </p>
                <span className="mt-0.5 inline-block rounded-full bg-brand/10 px-2.5 py-0.5 font-nunito text-[11px] font-medium text-brand">
                  {profileTypeLabel(profile.profile_type)}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  fullWidth={false}
                  className="!px-6 !py-2 text-sm"
                  loading={busy}
                  disabled={busy}
                  onClick={() => handleApprove(profile)}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  fullWidth={false}
                  className="!border-danger !px-6 !py-2 text-sm !text-danger hover:!bg-danger/5"
                  disabled={busy}
                  onClick={() => setRejectTarget(profile)}
                >
                  Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            variant="secondary"
            fullWidth={false}
            className="!px-8 !py-2.5 text-sm"
            loading={loadingMore}
            disabled={loadingMore}
            onClick={handleLoadMore}
          >
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
