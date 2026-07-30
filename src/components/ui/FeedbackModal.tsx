"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

/**
 * ErrorModal — mirrors the mobile Errormodal: a single message or a list of
 * password rule violations, in the brand voice.
 */
export function ErrorModal({
  open,
  onClose,
  message,
  passwordErrors,
}: {
  open: boolean;
  onClose: () => void;
  message?: string;
  passwordErrors?: string[];
}) {
  const hasList = passwordErrors && passwordErrors.length > 0;
  return (
    <Modal open={open} onClose={onClose}>
      <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-2xl">
          😕
        </div>
        {hasList ? (
          <>
            <p className="mb-2 font-poppins text-sm font-semibold text-ink">
              Fix these first:
            </p>
            <ul className="mb-5 space-y-1 text-left">
              {passwordErrors!.map((e, i) => (
                <li key={i} className="font-poppins text-xs text-muted">
                  • {e}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mb-5 font-poppins text-sm text-muted">{message}</p>
        )}
        <Button variant="primary" onClick={onClose}>
          Okay
        </Button>
      </div>
    </Modal>
  );
}

/** ConfirmModal — a destructive/irreversible action gate (e.g. deleting a
 * gist). Two real buttons, not a bare browser confirm(), so it matches the
 * rest of the app's look and can carry a proper danger color + loading state. */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose}>
      <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-2xl">
          ⚠️
        </div>
        <p className="mb-1.5 font-poppins text-sm font-semibold text-ink">{title}</p>
        <p className="mb-5 font-poppins text-sm text-muted">{message}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={loading}
            className="flex-1 !bg-danger !shadow-[0_10px_24px_-8px_rgba(212,29,12,0.5)]"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** SuccessModal — mirrors the mobile SuccessModal. `onConfirm`/`confirmLabel`
 * let a caller send the user somewhere specific (e.g. profile setup's "Let's
 * Gist" → /feed) instead of just dismissing; defaults to the plain "Nice"
 * dismiss behavior when omitted. */
export function SuccessModal({
  open,
  onClose,
  message,
  confirmLabel = "Nice",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  message?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-2xl">
          🎉
        </div>
        <p className="mb-5 font-poppins text-sm text-muted">{message}</p>
        <Button variant="primary" onClick={onConfirm ?? onClose}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
