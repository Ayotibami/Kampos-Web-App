"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, type AuthGateState } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";

/**
 * Optimistic client-side gate for guest-facing auth pages (login, signup,
 * forgot-password, reset-password). These used to block on gateServer — a
 * full server-to-backend round trip — before rendering anything, which
 * meant every visitor sat through a loading skeleton just so the rare
 * already-logged-in visitor could be redirected away. The overwhelmingly
 * common visitor here is a fresh guest, for whom that check always came
 * back "yes, stay" anyway.
 *
 * This renders nothing and blocks nothing — the form around it paints
 * immediately. It quietly resolves the real auth state after mount and
 * only redirects if it turns out the visitor shouldn't actually be here.
 * Nothing sensitive is gated by this (a guest-facing form has nothing to
 * leak), so a brief flash of the form for that rare already-logged-in case
 * is a fine trade for every other visitor never waiting on a network call.
 */
export function RedirectIfNotAllowed({ allow }: { allow: AuthGateState[] }) {
  const router = useRouter();
  const resolveAuthState = useAuthStore((s) => s.resolveAuthState);

  useEffect(() => {
    // silent: true — this is a quiet background peek, not a form submit;
    // it must not touch the shared `loading` flag a page's own submit
    // button reads (see resolveAuthState's own docstring).
    void resolveAuthState({ silent: true }).then((state) => {
      // "unknown" means the backend couldn't give a clear answer (slow,
      // unreachable, errored) — NOT "you don't belong here." Redirecting
      // on it would bounce a perfectly legitimate guest to /login just
      // because a background check happened to fail, which is exactly
      // the bug this comment is here to prevent from creeping back in.
      // Every other real state (guest/needs-otp/needs-profile/active) is
      // a genuine answer and still gets acted on normally.
      if (state !== "unknown" && !allow.includes(state)) {
        router.replace(destinationFor(state));
      }
    });
    // Deliberately mount-only — this is a one-time "should I actually be
    // on this page" check, not something that should re-run on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
