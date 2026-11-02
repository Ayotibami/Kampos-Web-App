"use client";

import { useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { AlertTriangle, Check, Send, Bell } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useBroadcastStore, type BroadcastSummary, type BroadcastAudience, type RecipientCount } from "@/stores/broadcastStore";

const AUDIENCE_OPTIONS: { value: BroadcastAudience; label: string }[] = [
  { value: "STUDENT", label: "Students" },
  { value: "KREATOR", label: "Kreators" },
  { value: "KOMPANY", label: "Kompanies" },
  { value: "SCHOOL", label: "Schools" },
  { value: "IDIOT", label: "Idiots" },
];

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
  // Multi-select — Students on by default, the king can add/remove any
  // combination of the other four from there.
  const [audiences, setAudiences] = useState<BroadcastAudience[]>(["STUDENT"]);
  const toggleAudience = (value: BroadcastAudience) =>
    setAudiences((prev) => (prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]));
  // Email on by default (preserves the page's original one-channel
  // behavior); Notification is the new opt-in. At least one of the two
  // must stay on — see canSend below.
  const [viaEmail, setViaEmail] = useState(true);
  const [viaNotification, setViaNotification] = useState(false);
  const [recipientCount, setRecipientCount] = useState<RecipientCount | null>(null);
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

  const atLeastOneChannel = viaEmail || viaNotification;
  // Subject only matters for the email leg — a notification is a single
  // line on the notification screen, nothing to put a subject on.
  const canSend =
    message.trim().length > 0 &&
    atLeastOneChannel &&
    audiences.length > 0 &&
    (!viaEmail || subject.trim().length > 0);

  const handleReview = async () => {
    setCheckingCount(true);
    try {
      const count = await fetchRecipientCount(audiences);
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
      const result = await createBroadcast({
        subject: subject.trim(),
        message: message.trim(),
        audiences,
        viaEmail,
        viaNotification,
      });
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

  // Joins the picked labels into a real list ("students, Kreators and
  // Kompanies") rather than just naming the first one — a multi-audience
  // send should read back exactly who it's going to.
  const audienceLabel = (() => {
    const labels = AUDIENCE_OPTIONS.filter((a) => audiences.includes(a.value)).map((a) => a.label.toLowerCase());
    if (labels.length === 0) return "recipients";
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  })();

  // Describes exactly what's about to happen across however many channels
  // are selected, with real counts for both — one clause per active
  // channel, joined into a real sentence.
  const confirmMessage = (() => {
    if (recipientCount === null) return "Checking who this would reach…";
    const clauses: string[] = [];
    if (viaEmail) {
      clauses.push(
        `email ${recipientCount.emailCount} active account${recipientCount.emailCount === 1 ? "" : "s"}`,
      );
    }
    if (viaNotification) {
      clauses.push(
        `put this on the notification screen of ${recipientCount.notificationCount} active ${audienceLabel} and push it to their device`,
      );
    }
    return `This will ${clauses.join(" and ")}. This can't be undone once sending starts.`;
  })();

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
        message={confirmMessage}
        confirmLabel="Send"
        icon={<AlertTriangle size={26} strokeWidth={2} />}
        loading={sending}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 md:px-10">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Broadcasts</h1>
          <p className="mt-1 font-nunito text-sm text-muted">
            Reach everyone on Kampos by email, notification, or both. Only king accounts can see this page.
          </p>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-line/70 p-5">
          <h2 className="font-nunito text-sm font-bold text-ink">Compose</h2>

          <div>
            <span className="mb-1.5 block font-nunito text-sm text-muted">Send to</span>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => {
                const selected = audiences.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAudience(opt.value)}
                    aria-pressed={selected}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-nunito text-xs font-bold transition ${
                      selected ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        selected ? "border-white bg-white/20" : "border-faint"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {audiences.length === 0 && (
              <p className="mt-1 font-nunito text-xs font-semibold text-danger">Pick at least one profile type.</p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block font-nunito text-sm text-muted">Send via</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setViaEmail((v) => !v)}
                aria-pressed={viaEmail}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-nunito text-xs font-bold transition ${
                  viaEmail ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/50"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    viaEmail ? "border-white bg-white/20" : "border-faint"
                  }`}
                >
                  {viaEmail && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <Send className="h-3.5 w-3.5" />
                Email
              </button>
              <button
                type="button"
                onClick={() => setViaNotification((v) => !v)}
                aria-pressed={viaNotification}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-nunito text-xs font-bold transition ${
                  viaNotification ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/50"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    viaNotification ? "border-white bg-white/20" : "border-faint"
                  }`}
                >
                  {viaNotification && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <Bell className="h-3.5 w-3.5" />
                Notification
              </button>
            </div>
            <p className="mt-1.5 font-nunito text-xs text-faint">
              Notification shows on their notification screen and sends as a push to their device — one switch
              covers both. Pick either, or both.
            </p>
            {!atLeastOneChannel && (
              <p className="mt-1 font-nunito text-xs font-semibold text-danger">Pick at least one channel.</p>
            )}
          </div>

          {viaEmail && <TextInput value={subject} onChange={setSubject} placeholder="Subject" label="Subject" />}
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
                    {/* A notification-only broadcast never has a subject
                        (nothing to put it on) — fall back to the message
                        itself so the row header is never blank. */}
                    <p className="min-w-0 shrink truncate font-nunito text-sm font-semibold text-ink">
                      {b.subject || b.message}
                    </p>
                    <span className="shrink-0 font-nunito text-xs text-faint">{timeAgo(b.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words font-nunito text-sm text-muted">{b.message}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {b.via_email && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 font-nunito text-[10px] font-bold text-brand">
                        Email
                      </span>
                    )}
                    {b.via_notification && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 font-nunito text-[10px] font-bold text-brand">
                        Notification
                      </span>
                    )}
                    {b.audiences.map((a) => (
                      <span key={a} className="rounded-full bg-surface-2 px-2 py-0.5 font-nunito text-[10px] font-bold text-muted">
                        {a}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 font-nunito text-xs">
                    <span className="text-muted">{b.total_recipients} total</span>
                    {/* Each channel only ever shows ITS OWN stats — an
                        email-only broadcast's push counts are meaningless
                        zeros (no push leg ran at all), and vice versa, so
                        showing both unconditionally would read as "this
                        failed" when really that channel was just never
                        turned on. */}
                    {b.via_email && (
                      <>
                        <span className="text-success">{b.sent_count} emailed</span>
                        {b.failed_count > 0 && <span className="text-danger">{b.failed_count} failed</span>}
                        {b.pending_count > 0 && <span className="text-warning">{b.pending_count} pending</span>}
                      </>
                    )}
                    {b.via_notification && (
                      <>
                        <span className="text-success">{b.push_sent_count} pushed</span>
                        {b.push_pending_count > 0 && (
                          <span className="text-warning">{b.push_pending_count} pending</span>
                        )}
                      </>
                    )}
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
