"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StaticPhoneOrbit } from "@/components/brand/StaticPhoneOrbit";
import { useAuthPromptStore } from "@/stores/authPromptStore";
import { useAuthStore } from "@/stores/authStore";

/** The one shared "you need an account" prompt — see requireAuth() and
 * authPromptStore. Mounted once in the root layout, so it's always
 * available regardless of which page/component triggers it.
 *
 * Branches on authStore's sessionExpired flag: a brand-new guest and
 * someone whose real session just died (refresh token revoked, or their
 * account vanishing out from under them) both land here via the exact same
 * requireAuth() gate, but they're not the same situation — telling someone
 * who already has an account to "sign up" is actively wrong, not just
 * unhelpful. */
export function AuthPromptModal() {
  const { open, action, close } = useAuthPromptStore();
  const sessionExpired = useAuthStore((s) => s.sessionExpired);

  return (
    <Modal open={open} onClose={close}>
      <div className="rounded-3xl bg-surface-2 p-6 text-center shadow-2xl">
        <StaticPhoneOrbit className="mx-auto h-32 w-32" />
        {sessionExpired ? (
          <>
            <h2 className="mt-3 font-nunito text-lg font-extrabold text-ink">
              Your session don expire
            </h2>
            <p className="mt-1.5 font-nunito text-sm text-muted">
              {action
                ? `Log in again to ${action} — your account is still there.`
                : "Log in again to continue — your account is still there."}
            </p>
            <div className="mt-5 space-y-2.5">
              <Link href="/login" className="block">
                <Button variant="primary" onClick={close}>
                  Log in
                </Button>
              </Link>
              <Link href="/signup" className="block">
                <Button variant="secondary" onClick={close}>
                  Actually, sign up instead
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-3 font-nunito text-lg font-extrabold text-ink">
              Oya, join Kampos first
            </h2>
            <p className="mt-1.5 font-nunito text-sm text-muted">
              {action ? `Sign up to ${action} — free, takes a minute.` : "Sign up to continue — free, takes a minute."}
            </p>
            <div className="mt-5 space-y-2.5">
              <Link href="/signup" className="block">
                <Button variant="primary" onClick={close}>
                  Sign up
                </Button>
              </Link>
              <Link href="/login" className="block">
                <Button variant="secondary" onClick={close}>
                  I already have an account
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
