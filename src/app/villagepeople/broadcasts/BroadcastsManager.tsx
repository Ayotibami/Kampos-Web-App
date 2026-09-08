"use client";

import { useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { AlertTriangle } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useBroadcastStore, type BroadcastSummary } from "@/stores/broadcastStore";

/**
 * Client half of /villagepeople/broadcasts — the server page.tsx does the
 * king-only gate + initial listBroadcasts() fetch; this owns the compose
 * form and the confirm-before-sending step, same split as AdminsManager.
 *
 * The recipient count is fetched fresh right before showing the confirm
 * step (not kept live on every keystroke) — it only matters at the moment
 * of actually deciding whether to send, and a stale count sitting on
 * screen while composing a long message would be misleading anyway.
 *
 * A sent broadcast's counts (sent/failed/pending) are a snapshot from the
 * moment it was created/last refreshed — pending can stay above 0 for a
 * while on a large send (see broadcastSender.ts), so "Refresh" re-fetches
 * the list rather than assuming a broadcast finishes instantly.
 */
export function BroadcastsManager({ initialBroadcasts }: { initialBroadcasts: BroadcastSummary[] }) {
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[]>(initialBroadcasts);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [checkingCount, setCheckingCount] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);

  const fetchRecipientCount = useBroadcastStore((s) => s.fetchRecipientCount);
  const createBroadcast = useBroadcastStore((s) => s.createBroadcast);
  const refreshBroadcasts = useBroadcastStore((s) => s.refreshBroadcasts);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };
  const succeed = (msg: string) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
  };

  const canSend = subject.trim().length > 0 && message.trim().length > 0;

  const handleReview = async () => {
    setCheckingCount(true);
    try {
      const count = await fetchRecipientCount();
      setRecipientCount(count);
      setConfirming(true);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to check recipient count"));
    } finally {
      setCheckingCount(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await createBroadcast(subject.trim(), message.trim());
      setConfirming(false);
      setSubject("");
      setMessage("");
      setRecipientCount(null);
      succeed(`Sending to ${result.total_recipients} account${result.total_recipients === 1 ? "" : "s"} now.`);
      try {
        setBroadcasts(await refreshBroadcasts());
      } catch {
        /* the send itself succeeded; the list just didn't refresh — not fatal */
      }
    } catch (err) {
      setConfirming(false);
      fail(apiErrorMessage(err, "Failed to send broadcast"));
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      setBroadcasts(await refreshBroadcasts());
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to refresh"));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successMessage} />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <ConfirmModal
        open={confirming}
        onClose={() => (sending ? undefined : setConfirming(false))}
        onConfirm={handleSend}
        title="Send this to everyone?"
        message={
          recipientCount === null
            ? "Checking who this would reach…"
            : `This will email ${recipientCount} active account${recipientCount === 1 ? "" : "s"}. This can't be undone once sending starts.`
        }
        confirmLabel="Send"
        icon={<AlertTriangle size={26} strokeWidth={2} />}
        loading={sending}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 md:px-10">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Broadcasts</h1>
          <p className="mt-1 font-nunito text-sm text-muted">
            Email every active account on Kampos. Only king accounts can see this page.
          </p>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line/70 p-5">
          <h2 className="font-nunito text-sm font-bold text-ink">Compose</h2>
          <TextInput value={subject} onChange={setSubject} placeholder="Subject" label="Subject" />
          <label className="block w-full">
            <span className="mb-1.5 block font-nunito text-sm text-muted">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you want to tell everyone?"
              rows={6}
              className="w-full resize-y rounded-2xl border border-line bg-surface-2 px-4 py-3 font-nunito text-sm text-ink transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </label>
          <div className="flex justify-end">
            <Button
              fullWidth={false}
              className="!px-6 !py-2.5 text-sm"
              disabled={!canSend}
              loading={checkingCount}
              onClick={handleReview}
            >
              Review &amp; send
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-nunito text-sm font-bold text-ink">History</h2>
            <Button
              variant="secondary"
              fullWidth={false}
              className="!px-3.5 !py-1.5 text-xs"
              loading={refreshing}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
          </div>
          {broadcasts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              No broadcasts sent yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {broadcasts.map((b) => (
                <li key={b.broadcast_id} className="flex flex-col gap-2 rounded-2xl border border-line/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-nunito text-sm font-semibold text-ink">{b.subject}</p>
                    <span className="shrink-0 font-nunito text-xs text-faint">{timeAgo(b.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words font-nunito text-sm text-muted">{b.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 font-nunito text-xs">
                    <span className="text-muted">{b.total_recipients} total</span>
                    <span className="text-success">{b.sent_count} sent</span>
                    {b.failed_count > 0 && <span className="text-danger">{b.failed_count} failed</span>}
                    {b.pending_count > 0 && <span className="text-warning">{b.pending_count} pending</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
