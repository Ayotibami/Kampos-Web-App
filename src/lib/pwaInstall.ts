"use client";

/**
 * Detects whether/how to offer installing Kampos to the home screen, and
 * owns the platform-specific "can we actually trigger it" state.
 *
 * Android/Chromium: the browser fires `beforeinstallprompt` once its own
 * engagement heuristics are satisfied — capturing it (and calling
 * preventDefault so the browser's own mini-infobar doesn't also show) is
 * what lets our own UI later call `.prompt()` on it for a real, one-tap
 * native install.
 *
 * iOS Safari: there is no equivalent event and never will be — Apple gives
 * web pages no programmatic way to trigger installation at all. The only
 * path is the user manually doing Share -> Add to Home Screen themselves,
 * so the best this can do is detect the platform and let the UI show
 * instructions instead of a button. Scoped to Safari specifically (not
 * Chrome/Firefox-on-iOS) because only Safari's own "Add to Home Screen"
 * produces a real standalone-mode PWA that respects the manifest — other
 * iOS browsers' equivalent just creates a bookmark that still opens inside
 * that browser's own chrome.
 */

import { useEffect, useState } from "react";

export type InstallPlatform = "android" | "ios-safari" | null;

const DISMISS_KEY = "kampos-install-prompt-dismissed-at";
// Once/day, every day, forever — deliberately not a long-term snooze. If
// they later install, isStandalone() stops this outright regardless of
// this timer; if they later uninstall, there's no separate "was installed
// once" flag either, so it naturally resumes nagging daily again.
const SNOOZE_MS = 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** True when actually running as the installed app (launched from a home
 * screen icon), not a plain browser tab — shared with SplashScreen, which
 * needs to defer to the OS's own native launch splash in that case instead
 * of showing its own on top of it. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own long-standing (non-standard) way of exposing this,
    // still the only reliable signal on that platform.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support instead of
  // "iPad" — maxTouchPoints is what actually distinguishes a real Mac.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  // Chrome/Firefox/Edge-on-iOS all include their own token alongside
  // "Safari" in the UA — real Mobile Safari has "Safari" with none of those.
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return /Safari/.test(ua) && !isOtherBrowser;
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

export function useInstallPrompt() {
  const [platform, setPlatform] = useState<InstallPlatform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    if (detectIOSSafari()) {
      setPlatform("ios-safari");
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // beforeinstallprompt also fires on desktop Chrome/Edge (they support
      // installing "desktop apps" too) — explicitly mobile-only here, since
      // a phone-style install prompt makes no sense on a desktop browser.
      if (!/Android/.test(navigator.userAgent)) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    const onInstalled = () => {
      // Genuinely installed now — no reason to ever ask again, regardless
      // of the daily snooze window.
      setPlatform(null);
      dismissInstallPrompt();
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** Android only — triggers the real native install prompt. Resolves to
   * whether the user actually accepted it. */
  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setPlatform(null);
    return outcome === "accepted";
  };

  const dismiss = () => {
    setPlatform(null);
    dismissInstallPrompt();
  };

  return { platform, promptInstall, dismiss };
}
