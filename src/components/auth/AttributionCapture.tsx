"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Mounted once at the root — captures first-touch UTM/referral/invite-code
 * attribution from the URL/`document.referrer` into localStorage as early
 * as possible, so it's in place by the time anyone actually reaches the
 * signup form. `captureAttribution` itself is idempotent (no-op once
 * something's already stored), so re-running this on every subsequent
 * client-side navigation — the root layout never remounts, so in practice
 * this only runs once per page life — is harmless either way.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
