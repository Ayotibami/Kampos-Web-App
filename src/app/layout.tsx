import type { Metadata, Viewport } from "next";
import { Poppins, Nunito } from "next/font/google";
import Script from "next/script";
import { SessionWatcher } from "@/components/auth/SessionWatcher";
import { AuthPromptModal } from "@/components/auth/AuthPromptModal";
import { ThemeRouteSync } from "@/components/theme/ThemeRouteSync";
import { env } from "@/lib/env";
import "./globals.css";

// Ported from the mobile app: Poppins for UI, Nunito for gist card text.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.SITE_URL),
  title: "Kampos — your campus life in one app",
  description:
    "Gists, rants, banters, school updates — Kampos drops you right in the middle of everything happening on your campus.",
  applicationName: "Kampos",
};

export const viewport: Viewport = {
  themeColor: "#165ABF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} ${nunito.variable} h-full`}>
      <body className="min-h-full antialiased">
        {/* Applies the saved theme before paint, so there's no flash — but
            defaults to light rather than following system preference, so a
            first-time visitor on a dark-mode OS still sees the light theme
            until they explicitly switch. Also gated to the same
            feed/profile/settings routes ThemeRouteSync enforces client-side
            (see its own docstring) — this only covers the initial/hard
            load; ThemeRouteSync handles subsequent client-side navigation. */}
        <Script id="kampos-theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('kampos-theme');var allowed=/^\\/(feed|profile|settings)(\\/|$)/.test(location.pathname);document.documentElement.classList.toggle('dark',allowed&&s==='dark');}catch(e){}})();`}
        </Script>
        <SessionWatcher />
        <ThemeRouteSync />
        <AuthPromptModal />
        {children}
      </body>
    </html>
  );
}
