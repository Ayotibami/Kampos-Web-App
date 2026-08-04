"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, type AuthGateState } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";

/**
 * Wraps a page and only renders it once the backend has confirmed the
 * visitor is actually allowed to be here — resolves the real auth state
 * (`GET /account/profile`, not anything trusted from local storage) on
 * every mount, and redirects to wherever that state's actual page is if
 * this one isn't in `allow`.
 *
 * Necessarily client-side: the session lives in an httpOnly cookie, which
 * Next.js middleware (server-side) can read but a page can still only act
 * on this after JS runs — so there's a brief spinner while resolving,
 * that's the accepted cost of not doing a bigger cookie+middleware SSR
 * migration for this pass.
 */
export function AuthGate({ allow, children }: { allow: AuthGateState[]; children: ReactNode }) {
  const router = useRouter();
  const resolveAuthState = useAuthStore((s) => s.resolveAuthState);
  const [resolved, setResolved] = useState<AuthGateState | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveAuthState().then((state) => {
      if (cancelled) return;
      if (allow.includes(state)) {
        setResolved(state);
      } else {
        router.replace(destinationFor(state));
      }
    });
    return () => {
      cancelled = true;
    };
    // Only re-resolve when the allowed-state set actually changes identity
    // (callers should pass a stable array) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!resolved) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center bg-surface">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    );
  }

  return <>{children}</>;
}
