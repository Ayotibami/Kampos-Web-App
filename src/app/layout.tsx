import type { Metadata, Viewport } from "next";
import { Poppins, Nunito } from "next/font/google";
import Script from "next/script";
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
        {/* Applies the saved/system theme before paint, so there's no light-mode flash. */}
        <Script id="kampos-theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('kampos-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
