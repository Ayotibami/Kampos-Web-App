"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { MediaImage } from "@/components/ui/MediaFrame";
import { Button } from "@/components/ui/Button";
import { ConfirmReasonModal } from "@/components/ui/FeedbackModal";
import { AdminPollPreview } from "@/components/villagepeople/AdminPollPreview";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useModerationStore } from "@/stores/moderationStore";
import type { PendingReport } from "@/lib/serverModeration";

const PAGE_SIZE = 20;

/**
 * Reports tab — accept (rejects the underlying gist too) / reject (dismiss,
 * gist untouched) pending reports. Each row shows the reporter's own reason
 * AND the reported gist's content (poster/text/media) inline, per the task:
 * an admin has to be able to judge a report without navigating away to find
 * the gist itself.
 *
 * "Load more" re-fetches from offset 0 with a bigger limit — see
 * PendingPostsTab's identical comment / moderationStore.ts's fetchReports
 * for why a growing offset would silently skip items in a shrinking queue.
 */
export function ReportsTab({
  initialReports,
  onFail,
  onSucceed,
  onCountChange,
}: {
  initialReports: PendingReport[];
  onFail: (msg: string) => void;
  onSucceed: (msg: string) => void;
  /** See PendingPostsTab's identical prop for why this exists. */
  onCountChange?: (count: number) => void;
}) {
  const [reports, setReports] = useState<PendingReport[]>(initialReports);

  useEffect(() => {
    onCountChange?.(reports.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length]);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingReport | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [limit, setLimit] = useState(Math.max(PAGE_SIZE, initialReports.length));
  const [hasMore, setHasMore] = useState(initialReports.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const acceptReport = useModerationStore((s) => s.acceptReport);
  const rejectReport = useModerationStore((s) => s.rejectReport);
  const fetchReports = useModerationStore((s) => s.fetchReports);

  const removeReport = (reportId: string) =>
    setReports((prev) => prev.filter((r) => r.report_id !== reportId));

  const handleLoadMore = async () => {
    const nextLimit = limit + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const fresh = await fetchReports(nextLimit);
      setReports(fresh);
      setLimit(nextLimit);
      setHasMore(fresh.length >= nextLimit);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load more reports"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAccept = async (report: PendingReport) => {
    setActioningId(report.report_id);
    try {
      await acceptReport(report.report_id);
      removeReport(report.report_id);
      onSucceed("Report accepted — the post was rejected.");
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to accept report"));
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (reason?: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await rejectReport(rejectTarget.report_id, reason);
      removeReport(rejectTarget.report_id);
      setRejectTarget(null);
      onSucceed("Report dismissed.");
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to dismiss report"));
    } finally {
      setRejecting(false);
    }
  };

  if (reports.length === 0 && !hasMore) {
    return (
      <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
        No pending reports to review.
      </p>
    );
  }

  return (
    <>
      <ConfirmReasonModal
        open={!!rejectTarget}
        onClose={() => (rejecting ? undefined : setRejectTarget(null))}
        onConfirm={handleReject}
        title="Dismiss this report?"
        message="The reported post stays untouched. You can add a reason for the record."
        confirmLabel="Dismiss"
        loading={rejecting}
      />

      <ul className="flex flex-col gap-3">
        {reports.map((report) => {
          const media = report.media?.[0];
          const busy = actioningId === report.report_id;
          return (
            <li key={report.report_id} className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-nunito text-xs font-semibold uppercase tracking-wide text-danger">
                  Reported by @{report.reporter_avitag}
                </p>
                <span className="shrink-0 font-nunito text-xs text-faint">{timeAgo(report.created_at)}</span>
              </div>

              {report.reason && (
                <p className="whitespace-pre-wrap break-words rounded-xl bg-danger/5 px-3 py-2 font-nunito text-sm text-ink">
                  &ldquo;{report.reason}&rdquo;
                </p>
              )}

              <div className="flex gap-3 rounded-2xl bg-surface-2 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
                  <Avatar src={report.image_url} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-nunito text-xs font-semibold text-ink">
                    {report.display_name || `@${report.gist_avitag}`}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words font-nunito text-sm text-muted">
                    {report.gist_text}
                  </p>
                  {report.poll && <AdminPollPreview poll={report.poll} />}
                  {media && (
                    <MediaImage
                      src={media.thumbnail_url ?? media.media_url}
                      className="mt-2 h-16 w-16 rounded-xl object-cover"
                    />
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  fullWidth={false}
                  className="!bg-danger !px-6 !py-2 text-sm !shadow-none"
                  loading={busy}
                  disabled={busy}
                  onClick={() => handleAccept(report)}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  fullWidth={false}
                  className="!px-6 !py-2 text-sm"
                  disabled={busy}
                  onClick={() => setRejectTarget(report)}
                >
                  Dismiss
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
