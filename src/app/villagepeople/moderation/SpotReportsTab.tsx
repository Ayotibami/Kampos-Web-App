"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmReasonModal } from "@/components/ui/FeedbackModal";
import { AdminSpotVideoTile } from "@/components/villagepeople/AdminSpotVideoTile";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useModerationStore } from "@/stores/moderationStore";
import type { PendingSpotReport } from "@/lib/serverModeration";

const PAGE_SIZE = 20;

/**
 * Spot Reports tab — same accept (takes the underlying Spot down too) /
 * reject (dismiss, Spot untouched) shape as ReportsTab.tsx's own gist
 * version, against spot/report.repo.ts's endpoints instead. Each row shows
 * the reporter's own reason plus the reported clip itself, via the same
 * AdminSpotVideoTile the All Spots browse screen uses — autoplaying muted
 * as it scrolls into view, not a static click-to-preview thumbnail, so an
 * admin can actually review reported clips while scrolling through the
 * queue instead of tapping into each one individually.
 *
 * "Load more" re-fetches from offset 0 with a bigger limit — same reasoning
 * as ReportsTab's identical comment: this queue shrinks as an admin works
 * it, so a growing offset would silently skip items.
 */
export function SpotReportsTab({
  initialReports,
  onFail,
  onSucceed,
  onCountChange,
}: {
  initialReports: PendingSpotReport[];
  onFail: (msg: string) => void;
  onSucceed: (msg: string) => void;
  onCountChange?: (count: number) => void;
}) {
  const [reports, setReports] = useState<PendingSpotReport[]>(initialReports);

  useEffect(() => {
    onCountChange?.(reports.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length]);

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingSpotReport | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [limit, setLimit] = useState(Math.max(PAGE_SIZE, initialReports.length));
  const [hasMore, setHasMore] = useState(initialReports.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const acceptSpotReport = useModerationStore((s) => s.acceptSpotReport);
  const rejectSpotReport = useModerationStore((s) => s.rejectSpotReport);
  const fetchSpotReports = useModerationStore((s) => s.fetchSpotReports);

  const removeReport = (reportId: string) =>
    setReports((prev) => prev.filter((r) => r.report_id !== reportId));

  const handleLoadMore = async () => {
    const nextLimit = limit + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const fresh = await fetchSpotReports(nextLimit);
      setReports(fresh);
      setLimit(nextLimit);
      setHasMore(fresh.length >= nextLimit);
    } catch (err) {
      onFail(apiErrorMessage(err, "Failed to load more reports"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAccept = async (report: PendingSpotReport) => {
    setActioningId(report.report_id);
    try {
      await acceptSpotReport(report.report_id);
      removeReport(report.report_id);
      onSucceed("Report accepted — the Spot was taken down.");
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
      await rejectSpotReport(rejectTarget.report_id, reason);
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
        No pending Spot reports to review.
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
        message="The reported Spot stays untouched. You can add a reason for the record."
        confirmLabel="Dismiss"
        loading={rejecting}
      />

      <ul className="flex flex-col gap-3">
        {reports.map((report) => {
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

              <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
                    <Avatar src={report.image_url} />
                  </div>
                  <p className="min-w-0 flex-1 truncate font-nunito text-xs font-semibold text-ink">
                    {report.display_name || `@${report.spot_avitag}`}
                  </p>
                </div>
                <div className="flex gap-3">
                  <AdminSpotVideoTile mediaUrl={report.spot_media_url} thumbnailUrl={report.spot_thumbnail_url} />
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-nunito text-sm text-muted">
                    {report.spot_caption || <span className="text-faint">No caption</span>}
                  </p>
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
