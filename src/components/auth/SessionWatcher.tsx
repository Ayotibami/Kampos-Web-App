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
    const onUnauthorized = () => {
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
