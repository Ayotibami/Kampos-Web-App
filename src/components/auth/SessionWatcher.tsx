"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

/**
 * Mounted once at the root — listens for a session dying mid-use (the
 * refresh token itself expired/revoked, not just the short-lived access
 * token, which the axios interceptor already renews silently on its own).
 * Without this, a dead session just failed silently on every subsequent
 * API call until the next full page load happened to trigger an AuthGate
 * check; this makes that check happen immediately instead.
 */
export function SessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    const onUnauthorized = async () => {
      // Re-verify once before giving up — as a final safety net, in case
      // the backend recovered between the failed refresh attempt and now
      // (e.g. Render cold-start finishing). resolveAuthState uses
      // skipUnauthorizedEvent so this check itself can't re-trigger this
      // same handler. Only redirect if the session is genuinely gone.
      try {
        const state = await useAuthStore.getState().resolveAuthState({ silent: true });
        // "unknown" means this re-verify itself couldn't get a clear
        // answer (backend slow/unreachable) — not proof the session is
        // dead. Only a real, confirmed non-active state should force a
        // logout; a shrug should leave things as they were, same as
        // everywhere else this same "unknown" case is handled.
        if (state === "active" || state === "unknown") return;
      } catch {
        // ignore — treat as session gone
      }
      useAuthStore.setState({
        user: null,
        profiles: [],
        authState: "guest",
        avitag: null,
        profileType: null,
      });
      router.replace("/login");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  return null;
}
