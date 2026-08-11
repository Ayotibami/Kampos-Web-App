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
      {/* `h-dvh` + `overflow-hidden` on mobile (not just `min-h-dvh`) — the
          whole point is this screen fits in one shot on a real phone with
          no scroll. The preview card above is the flexible part (`flex-1
          min-h-0`, no fixed height), so it's the one that shrinks to
          whatever room is actually left on a short viewport; the heading/
          copy/buttons below always get their natural size and are never
          the thing that gets squeezed or clipped. */}
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-brand text-white md:flex-row">
        {/* Gist card preview half */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 pt-6 sm:pt-10 md:flex-[1.1] md:p-10">
          <GistPreviewMarquee className="h-full w-full max-w-sm sm:max-w-md md:h-[80%] md:max-w-lg" />
        </div>

        {/* Copy + controls half */}
        <div className="flex shrink-0 flex-col px-6 pb-6 pt-4 sm:pb-8 md:flex-1 md:justify-center md:px-16 md:py-12">
          <header className="text-center md:text-left">
            <h1 className="font-nunito text-xl font-extrabold text-white sm:text-2xl md:text-4xl">
              Welcome to <span className="text-brand-accent">Kampos</span>
            </h1>
          </header>

          <p className="mt-3 text-center font-nunito text-xs leading-relaxed text-white/85 sm:mt-4 sm:text-sm md:mt-8 md:max-w-md md:text-base">
            Oya, enough talk — it&apos;s time to dive in and experience Kampos
            for yourself. Tap in, let&apos;s make some crazy memories together fr
            fr. 🚀
          </p>

          <div className="mt-4 space-y-2.5 sm:mt-6 sm:space-y-3 md:mt-10 md:max-w-xs">
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
