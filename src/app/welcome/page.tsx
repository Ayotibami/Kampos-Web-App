import Link from "next/link";
import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { GistPreviewMarquee } from "@/components/brand/GistPreviewMarquee";
import { Button } from "@/components/ui/Button";

/**
 * Landing / welcome screen — ported from the mobile LandingScreen. Reached
 * after onboarding.
 *
 * Desktop is a full-bleed solid-blue split screen (same structural pattern
 * as the onboarding carousel) — no boxed/rounded card. Left half is a
 * bigger real-GistCard preview swiping through the feed; right half is the
 * heading/copy/CTAs. Mobile keeps the original stacked layout.
 */
export default async function WelcomePage() {
  // Guest-only, same as the auth pages — anyone already logged in (at any
  // stage: unverified, no profile, or fully active) gets sent to wherever
  // they actually belong instead of being able to wander back here.
  const { state, account, profiles } = await gateServer(["guest"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <div className="flex min-h-dvh w-full flex-col bg-brand text-white md:h-dvh md:flex-row md:overflow-hidden">
        {/* Gist card preview half */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 pt-10 md:flex-[1.1] md:p-10">
          <GistPreviewMarquee className="h-[26rem] w-full max-w-sm sm:h-[28rem] sm:max-w-md md:h-[80%] md:max-w-lg" />
        </div>

        {/* Copy + controls half */}
        <div className="flex flex-col px-6 pb-10 pt-6 md:flex-1 md:justify-center md:px-16 md:py-12">
          <header className="text-center md:text-left">
            <h1 className="font-poppins text-2xl font-extrabold text-white sm:text-3xl md:text-4xl">
              Welcome to <span className="text-brand-accent">Kampos</span>
            </h1>
          </header>

          <p className="mt-6 text-center font-poppins text-sm leading-relaxed text-white/85 md:mt-8 md:text-left md:max-w-md md:text-base">
            Oya, enough talk — it&apos;s time to dive in and experience Kampos
            for yourself. Tap in, let&apos;s make some crazy memories together fr
            fr. 🚀
          </p>

          <div className="mt-8 space-y-3 md:mt-10 md:max-w-xs">
            <Link href="/login" className="block">
              <Button variant="secondary" invert>
                Hop in
              </Button>
            </Link>
            <Link href="/signup" className="block">
              <Button variant="primary" invert className="shadow-[0_10px_24px_-8px_rgba(0,0,0,0.5)]">
                Join Kampos
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
