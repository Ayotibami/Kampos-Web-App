"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/stores/themeStore";

// Dark mode only ever actually renders on the main, post-auth app surface —
// feed, settings, and a profile (own or anyone else's). Everywhere else
// (login, signup, welcome, onboarding, setup-profile, password reset)
// always renders light regardless of the user's saved preference, so the
// first-impression/auth flow never looks broken by whatever theme they
// left the main app in.
//
// A profile lives at the root (/avitag, no /profile prefix — see
// lib/validation.ts's reserved-word list), so it can't be matched by a
// fixed path segment the way feed/settings can. Everything that ISN'T one
// of the known light-only routes is treated as a profile page instead.
const LIGHT_ONLY_ROUTES = new Set([
  "", // "/"
  "welcome",
  "login",
  "signup",
  "signup-success",
  "verify-otp",
  "forgot-password",
  "reset-password",
  "setup-profile",
  "gist", // /gist/[gistId] — public share view, deliberately excluded
]);

function isDarkEnabledRoute(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] ?? "";
  if (firstSegment === "feed" || firstSegment === "settings") return true;
  return !LIGHT_ONLY_ROUTES.has(firstSegment);
}

/** The one place that actually mutates the `.dark` class on `<html>` — see
 * themeStore's own docstring. Mounted once in the root layout; re-syncs on
 * every client-side navigation (not just full page loads), since App
 * Router route changes don't re-run the beforeInteractive theme script. */
export function ThemeRouteSync() {
  const pathname = usePathname();
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const allowed = isDarkEnabledRoute(pathname);
    document.documentElement.classList.toggle("dark", allowed && theme === "dark");
  }, [pathname, theme]);

  return null;
}
