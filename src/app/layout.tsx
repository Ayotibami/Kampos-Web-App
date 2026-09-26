import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import Script from "next/script";
import { SessionWatcher } from "@/components/auth/SessionWatcher";
import { TokenRefreshTimer } from "@/components/auth/TokenRefreshTimer";
import { WebVitals } from "@/components/layout/WebVitals";
import { AuthPromptModal } from "@/components/auth/AuthPromptModal";
import { OfflineSync } from "@/components/auth/OfflineSync";
import { ConnectivityPill } from "@/components/layout/ConnectivityPill";
import { GistActionToast } from "@/components/gist/GistActionToast";
import { AuthToast } from "@/components/auth/AuthToast";
import { AdminNotificationToast } from "@/components/villagepeople/AdminNotificationToast";
import { ThemeRouteSync } from "@/components/theme/ThemeRouteSync";
import { SoundPreload } from "@/components/theme/SoundPreload";
import { FeedScrollLock } from "@/components/layout/FeedScrollLock";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { InputModalitySync } from "@/components/layout/InputModalitySync";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { SplashScreen } from "@/components/brand/SplashScreen";
import { env } from "@/lib/env";
import "./globals.css";

// Ported from the mobile app — Nunito is now the app's only font (see
// Wordmark.tsx for why: Poppins didn't read as intended, design called for
// Nunito everywhere instead of the original Poppins-UI/Nunito-content split).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  // Every font-weight utility actually used in the app (medium/semibold/
  // bold/extrabold), plus 400 as the base — exact weights, not a wider
  // range than what's really needed.
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const DESCRIPTION =
  "Gists, rants, banters, school updates — Kampos drops you right in the middle of everything happening on your campus.";

export const metadata: Metadata = {
  metadataBase: new URL(env.SITE_URL),
  title: {
    default: "Kampos — your campus life in one app",
    // Pages that set their own <title> (e.g. /gist/[gistId]) get
    // "{their title} | Kampos" instead of losing the brand name entirely.
    template: "%s | Kampos",
  },
  description: DESCRIPTION,
  applicationName: "Kampos",
  keywords: ["Kampos", "campus", "gists", "student app", "university social app", "Nigerian students"],
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Kampos",
    statusBarStyle: "black-translucent",
    // iOS has no equivalent of Android's auto-generated splash from the
    // manifest — these are real, pre-rendered full-screen PNGs (see
    // scripts/generate-ios-splash.mjs) that iOS shows the instant the
    // installed app launches, before any of this page's own JS has run.
    startupImage: [
      {
        url: "/splash/iphone-se.png",
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone-11-xr.png",
        media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone-12-13-14.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone-14pro-15-16.png",
        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone-11pro-max-xsmax.png",
        media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone-pro-max.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
    ],
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png",
  },
  openGraph: {
    type: "website",
    siteName: "Kampos",
    title: "Kampos — your campus life in one app",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Kampos — your campus life in one app",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#165ABF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Without this, Safari/Chrome confine the page to the phone's "safe
  // area" and paint their own default chrome color into the notch/
  // rounded-corner/home-indicator margins instead of letting the page
  // draw there — exactly the gray border around the Spot video screen
  // that should be edge-to-edge black. "cover" lets content extend the
  // whole physical screen; the app then re-adds that space back as
  // padding via env(safe-area-inset-*).
  //
  // That re-adding is NOT automatic, and it is the whole reason an app
  // saved to the home screen can look broken while the same page looks
  // fine in a browser tab: in a tab iOS reserves the status-bar strip for
  // itself, but an installed "standalone" PWA has no browser chrome at
  // all, so with "cover" (plus black-translucent below) the page draws
  // from the very top of the physical screen. Anything anchored to the top
  // of the screen therefore has to consume env(safe-area-inset-top)
  // itself, and anything anchored to the bottom env(safe-area-inset-bottom).
  // Both resolve to 0 in a browser tab and on desktop, so adding them is
  // free everywhere they aren't needed.
  //
  // Where that's handled today: AppShell's centered lane pads the top for
  // every page it frames (settings, profile, auth, setup wizard); the
  // feed/gist/Spot pages own an exactly-viewport-tall box of their own and
  // pad their own headers/overlays instead; MobileTabBar,
  // FloatingComposeButton and the sheet composers carry the bottom inset.
  // Any NEW top- or bottom-anchored chrome must do the same, or it will
  // sit under the status bar / home indicator once the app is installed.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning (on <html> only, not <body>/children): the
  // kampos-theme-init script below runs BEFORE hydration and toggles the
  // `dark` class straight on this element from localStorage — the server
  // has no way to know that value, so its SSR output never has `dark`
  // even when the client is about to add it. That's the intended
  // no-flash-of-wrong-theme behavior, not a bug; without this, React logs
  // a hydration-mismatch warning for a difference it was never going to
  // reconcile anyway.
  return (
    <html lang="en" className={`${nunito.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full antialiased">
        {/* Applies the saved theme before paint, so there's no flash — but
            defaults to light rather than following system preference, so a
            first-time visitor on a dark-mode OS still sees the light theme
            until they explicitly switch. Also gated to the same
            feed/settings/profile routes ThemeRouteSync enforces client-side
            (see its own docstring, and isDarkEnabledRoute's for why a
            profile — root-level /avitag — can't be matched by a fixed path
            segment) — this only covers the initial/hard load;
            ThemeRouteSync handles subsequent client-side navigation. Kept
            in sync by hand since this one has to run as a raw inline
            script, before hydration, not the TS module ThemeRouteSync
            imports its route list from. */}
        <Script id="kampos-theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('kampos-theme');var seg=(location.pathname.split('/')[1]||'');var light={'':1,welcome:1,login:1,signup:1,'signup-success':1,'verify-otp':1,'forgot-password':1,'reset-password':1,'setup-profile':1,gist:1};var allowed=seg==='feed'||seg==='settings'||!light[seg];document.documentElement.classList.toggle('dark',allowed&&s==='dark');}catch(e){}})();`}
        </Script>
        {/* Registers the PWA service worker on first page load so subsequent
            visits serve cached static assets and HTML instantly. Runs after
            the page is interactive so it never competes with the critical
            render path.

            Gated on an actual production build (NODE_ENV, evaluated here on
            the server and baked into the string literally as true/false —
            this file has no "use client", so this genuinely runs server-
            side, not just at build time), NOT on `location.hostname`.
            hostname-sniffing for "am I developing" only worked when dev
            testing happened on the same machine as the dev server —
            testing on a real phone means reaching the dev server by its LAN
            IP, which isn't "localhost" either, so the SW registered there
            anyway and cache-first-served an increasingly stale JS bundle no
            matter how many times the page was reloaded on that phone. */}
        <Script id="kampos-sw" strategy="afterInteractive">
          {`if('serviceWorker' in navigator&&${process.env.NODE_ENV === "production"}){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(r){console.log('[SW] registered',r.scope)},function(e){console.log('[SW] failed',e)})})}`}
        </Script>
        <SplashScreen />
        <WebVitals />
        <SessionWatcher />
        <TokenRefreshTimer />
        <ThemeRouteSync />
        <SoundPreload />
        <FeedScrollLock />
        <InputModalitySync />
        <OfflineSync />
        <ConnectivityPill />
        <GistActionToast />
        <AuthToast />
        <AdminNotificationToast />
        <AuthPromptModal />
        <InstallPrompt />
        <MobileTabBar />
        {children}
      </body>
    </html>
  );
}
