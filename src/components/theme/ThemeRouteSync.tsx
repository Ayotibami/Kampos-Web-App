"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/stores/themeStore";

// Dark mode only ever actually renders on the main, post-auth app surface —
// feed, profile, settings. Everywhere else (login, signup, welcome,
// onboarding, setup-profile, password reset) always renders light
// regardless of the user's saved preference, so the first-impression/auth
// flow never looks broken by whatever theme they left the main app in.
const DARK_ENABLED_ROUTE = /^\/(feed|profile|settings)(\/|$)/;

/** The one place that actually mutates the `.dark` class on `<html>` — see
 * themeStore's own docstring. Mounted once in the root layout; re-syncs on
 * every client-side navigation (not just full page loads), since App
 * Router route changes don't re-run the beforeInteractive theme script. */
export function ThemeRouteSync() {
  const pathname = usePathname();
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const allowed = DARK_ENABLED_ROUTE.test(pathname);
    document.documentElement.classList.toggle("dark", allowed && theme === "dark");
  }, [pathname, theme]);

  return null;
}
