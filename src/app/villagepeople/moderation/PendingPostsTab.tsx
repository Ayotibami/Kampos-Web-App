"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { MediaImage } from "@/components/ui/MediaFrame";
import { Button } from "@/components/ui/Button";
import { ConfirmReasonModal } from "@/components/ui/FeedbackModal";
import { FlagIconFill } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useModerationStore } from "@/stores/moderationStore";
import { PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import { normalizeProfileType } from "@/types";
import type { PendingGist } from "@/lib/serverModeration";

// Gists move fast — the first batch casts a much wider net than the other
// two queues (Reports/Profile Verifications stay at the backend's default
// 20) so an admin isn't only ever seeing a sliver of what's pending. Must
// match serverModeration.ts's own INITIAL_GIST_LIMIT, which is what
// actually requests this size from the backend for the very first fetch —
// this constant only governs how `hasMore` is judged against that fetch,
// not the fetch itself (that already happened server-side by the time this
// component mounts).
const INITIAL_LIMIT = 100;
// Subsequent "Load more" clicks step up by this much at a time, same as
// the other two tabs — no need for every later batch to also be huge.
const PAGE_SIZE = 20;

/**
 * Pending Posts tab — approve/reject SUBMITTED gists. Mirrors AdminsManager's
 * "own the list in local state, splice on success, apiErrorMessage on
 * failure, leave the row in place" approach, just with per-row action state
 * (`actioningId`) instead of one global boolean, since this is a list of
 * many items rather than admins.tsx's single grant form.
 *
 * Only the first media item is shown as a thumbnail — a full multi-media
 * grid (GistMediaGrid) is overkill for a moderation queue row; an admin just
 * needs to see whether/what media is attached, not page through it here.
 *
 * "Load more" always re-fetches from offset 0 with a bigger limit rather
 * than paging forward — see moderationStore.ts's own comment on fetchGists
 * for why a growing offset would silently skip items in a queue that
 * shrinks as you work it.
 */
export function PendingPostsTab({
  initialGists,
  onFail,
  onSucceed,
  onCountChange,
}: {
  initialGists: PendingGist[];
  onFail: (msg: string) => void;
  onSucceed: (msg: string) => void;
  /** Reports this tab's own live count up to ModerationManager's tab
   * badges — called on mount and again after every approve/reject, so the
   * "Pending Posts" tab's badge count stays in sync with what's actually
   * left in the queue, not just a snapshot from before this tab was ever
   * opened. */
  onCountChange?: (count: number) => void;
}) {
  const router = useRouter();
  const [gists, setGists] = useState<PendingGist[]>(initialGists);

  useEffect(() => {
    onCountChange?.(gists.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gists.length]);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingGist | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [limit, setLimit] = useState(Math.max(INITIAL_LIMIT, initialGists.length));
  // Whether there's likely more beyond the current `limit` — set purely
  // from fetch results (got back a full page => probably more), NEVER from
  // `gists.length`, since that shrinks every time an admin approves/rejects
  // something and would otherwise hide "Load more" prematurely even when
  // plenty more is still sitting on the server. Compared against
  // INITIAL_LIMIT here specifically because the very first fetch (done
  // server-side, before this component even mounts) requested that many,
  // not PAGE_SIZE — getting back, say, 45 of a possible 100 correctly means
  // "that's everything", not "there might be more".
  const [hasMore, setHasMore] = useState(initialGists.length >= INITIAL_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);

  const approveGist = useModerationStore((s) => s.approveGist);
  const rejectGist = useModerationStore((s) => s.rejectGist);
  const fetchGists = useModerationStore((s) => s.fetchGists);

  const removeGist = (gistId: string) => setGists((prev) => prev.filter((g) => g.gist_id !== gistId));

  const handleLoadMore = async () => {
    const nextLimit = limit + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const fresh = await fetchGists(nextLimit);
      setGists(fresh);
      setLimit(nextLimit);
      setHasMore(fresh.length >= nextLimit);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load more posts"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleApprove = async (gist: PendingGist) => {
    setActioningId(gist.gist_id);
    try {
      await approveGist(gist.gist_id);
      removeGist(gist.gist_id);
      onSucceed("Post approved.");
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to approve post"));
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (reason?: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await rejectGist(rejectTarget.gist_id, reason);
      removeGist(rejectTarget.gist_id);
      setRejectTarget(null);
      onSucceed("Post rejected.");
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to reject post"));
    } finally {
      setRejecting(false);
    }
  };

  // Only the truly-empty state (nothing visible AND nothing more to fetch)
  // shows the "all clear" message — if an admin clears every visible item
  // but more exist beyond the current limit, we go straight to loading the
  // next batch instead of falsely claiming the queue is empty.
  if (gists.length === 0 && !hasMore) {
    return (
      <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
        No pending posts to review.
      </p>
    );
  }

  return (
    <>
      <ConfirmReasonModal
        open={!!rejectTarget}
        onClose={() => (rejecting ? undefined : setRejectTarget(null))}
        onConfirm={handleReject}
        title="Reject this post?"
        message="It won't be published. You can add a reason for the record."
        confirmLabel="Reject"
        loading={rejecting}
      />

      <ul className="flex flex-col gap-3">
        {gists.map((gist) => {
          const media = gist.media?.[0];
          const busy = actioningId === gist.gist_id;
          // Same "jump to this poster's profile" affordance as
          // AdminGistCard.tsx (the All Gists tab) — reviewing a pending
          // post is exactly when an admin most wants a poster's history
          // without a detour through Profiles' own search.
          const normalizedType = normalizeProfileType(gist.profile_type);
          const goToProfile = () => {
            if (!normalizedType) return;
            router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH[normalizedType]}/${gist.avitag}`);
          };
          return (
            <li key={gist.gist_id} className="flex gap-3 rounded-2xl border border-line/70 p-4">
              <button
                type="button"
                onClick={goToProfile}
                disabled={!normalizedType}
                className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line transition enabled:hover:ring-brand/40"
              >
                <Avatar src={gist.image_url} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={goToProfile}
                    disabled={!normalizedType}
                    className="truncate text-left font-nunito text-sm font-semibold text-ink enabled:hover:underline"
                  >
                    {gist.display_name || `@${gist.avitag}`}
                  </button>
                  <span className="shrink-0 font-nunito text-xs text-faint">{timeAgo(gist.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words font-nunito text-sm text-muted">{gist.gist_text}</p>
                {media && (
                  <MediaImage
                    src={media.thumbnail_url ?? media.media_url}
                    className="mt-2 h-20 w-20 rounded-xl object-cover"
                  />
                )}
                {typeof gist.reports_count === "number" && gist.reports_count > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 font-nunito text-xs font-medium text-danger">
                    <FlagIconFill className="h-3.5 w-3.5" weight="fill" />
                    {gist.reports_count} report{gist.reports_count === 1 ? "" : "s"}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    fullWidth={false}
                    className="!px-6 !py-2 text-sm"
                    loading={busy}
                    disabled={busy}
                    onClick={() => handleApprove(gist)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    className="!border-danger !px-6 !py-2 text-sm !text-danger hover:!bg-danger/5"
                    disabled={busy}
                    onClick={() => setRejectTarget(gist)}
                  >
                    Reject
                  </Button>
                </div>
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
