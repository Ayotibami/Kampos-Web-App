"use client";

import { useEffect } from "react";
import { preloadSounds } from "@/lib/sounds";

/** Mounted once in the root layout, next to ThemeRouteSync — kicks off
 * fetching + decoding the four UI sound effects (tap/pop/whoosh/delete) as
 * soon as the app loads, so the FIRST like/comment/tap of the session
 * already has its sound ready instead of playing silently while it loads
 * in the background. Renders nothing. */
export function SoundPreload() {
  useEffect(() => {
    preloadSounds();
  }, []);

  return null;
}
