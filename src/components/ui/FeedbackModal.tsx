"use client";

import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { AlertCircle, AlertTriangle, CheckCircle } from "./icons";

/**
 * ErrorModal — mirrors the mobile Errormodal: a single message or a list of
 * password rule violations, in the brand voice.
 *
 * Full-bleed amber wash, not a white card with a small red badge — most of
 * what lands here is "try again" or "log back in," not genuine danger, so
 * it stays in the app's warning color, not the danger red ConfirmModal
 * reserves for anything actually destructive. Icon and button carry the
 * amber; body copy stays in the normal ink/muted tokens rather than a new
 * one-off "deep amber" text color — plenty of contrast on a wash this
 * light, and it keeps the copy reading like the rest of the app instead of
 * introducing a color no other text uses.
 *
 * The card is an OPAQUE tint (a real hex value per theme), not `bg-warning/
 * 15` — that low-alpha version let whatever sits behind the modal (a busy
 * screen like the login page's own branded backdrop, on top of Modal.tsx's
 * own translucent/blurred backdrop) show straight through, so the dialog
 * read as a barely-there see-through smear instead of a solid card. An
 * opaque tint close in lightness to the app's real surface tokens keeps
 * the ink/muted text below at the same contrast it always has, regardless
 * of what's on screen underneath.
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
      <div className="rounded-3xl bg-[#fff6df] p-6 text-center shadow-2xl dark:bg-[#3a2f19]">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center text-warning">
          <AlertCircle size={30} strokeWidth={2} />
        </div>
        {hasList ? (
          <>
            <p className="mb-2 font-nunito text-sm font-semibold text-ink">
              Fix these first:
            </p>
            <ul className="mb-5 space-y-1 text-left">
              {passwordErrors!.map((e, i) => (
                <li key={i} className="font-nunito text-xs text-muted">
                  • {e}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mb-5 font-nunito text-sm text-muted">{message}</p>
        )}
        {/* text-brand-ink, not text-white — bg-warning is bright amber/yellow
            in both themes (it's one of the fixed feedback tokens, not a
            theme-aware surface one), so the button needs a fixed dark text
            color to stay legible rather than one that flips with the theme. */}
        <Button onClick={onClose} className="!bg-warning !text-brand-ink !shadow-none">
          Okay
        </Button>
      </div>
    </Modal>
  );
}

/** ConfirmModal — a destructive/irreversible action gate (e.g. deleting a
 * gist, logging out, deactivating an account). Full-bleed danger red, not a
 * white card with a small badge — unlike ErrorModal, everything landing
 * here genuinely means "you can't undo this," so it's allowed to be the one
 * loud, unmistakable moment in the app. `icon` is per-caller (a trash glyph
 * for delete, a logout glyph for logout, a warning triangle for deactivate)
 * since these are three different actions, not one generic "danger" — a
 * single shared icon would blur that distinction the color alone can't
 * carry. Defaults to AlertTriangle for any future caller that doesn't pass
 * one. */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  loading = false,
  icon = <AlertTriangle size={26} strokeWidth={2} />,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose}>
      <div className="rounded-3xl bg-danger p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center text-white">
          {icon}
        </div>
        <p className="mb-1.5 font-nunito text-sm font-semibold text-white">{title}</p>
        <p className="mb-5 font-nunito text-sm text-white/80">{message}</p>
        <div className="flex gap-2">
          <Button
            onClick={onClose}
            disabled={loading}
            className="flex-1 !bg-white/15 !text-white !shadow-none hover:!bg-white/25"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={loading}
            className="flex-1 !bg-white !text-danger !shadow-none"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** SuccessModal — mirrors the mobile SuccessModal. `onConfirm`/`confirmLabel`
 * let a caller send the user somewhere specific instead of just dismissing;
 * defaults to the plain "Nice" dismiss behavior when omitted.
 *
 * Full-bleed success green — completes the same full-bleed language
 * ErrorModal (amber) and ConfirmModal (red) already use, so all three
 * feedback dialogs read as one family: solid color card means this dialog
 * means business, whatever the actual message is.
 *
 * The one deliberate exception is profile setup's completion screen —
 * that's WelcomeSheet now, a real milestone moment with its own much
 * richer content (Kappy, confetti, the actual "what is Kampos" pitch),
 * not a plain confirmation this generic component was ever going to fit. */
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
      <div className="rounded-3xl bg-[#0e5c31] p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center text-[#b7f5cd]">
          <CheckCircle size={30} strokeWidth={2} />
        </div>
        <p className="mb-5 font-nunito text-sm text-[#e3fbec]">{message}</p>
        <Button onClick={onConfirm ?? onClose} className="!bg-white !text-[#0e5c31] !shadow-none">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
