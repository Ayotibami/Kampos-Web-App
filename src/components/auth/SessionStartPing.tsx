"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { pingActivity } from "@/lib/activityPing";

const SESSION_FLAG = "kampos-session-start-pinged";

// Belt-and-braces alongside the sessionStorage flag below: if storage is
// unavailable (private mode) this still stops a second ping within the
// SAME page life (e.g. React Strict Mode's dev-only double-invoke).
let firedThisPageLife = false;

/**
 * Mounted once at the root, next to SessionWatcher — fires `session_start`
 * exactly once per browser session, the moment the auth store resolves to
 * a genuinely authenticated ("active") state. Gated on sessionStorage
 * (not a plain module flag alone) so a full page reload mid-session
 * doesn't re-fire it — "once per session" means once per tab's session,
 * not once per mount.
 */
export function SessionStartPing() {
  const authState = useAuthStore((s) => s.authState);

  useEffect(() => {
    if (authState !== "active") return;
    if (firedThisPageLife) return;
    try {
      if (sessionStorage.getItem(SESSION_FLAG) === "true") return;
      sessionStorage.setItem(SESSION_FLAG, "true");
    } catch {
      // sessionStorage unavailable — fall through and still fire once via
      // the module-level flag, rather than silently never pinging at all.
    }
    firedThisPageLife = true;
    pingActivity("session_start");
  }, [authState]);

  return null;
}
