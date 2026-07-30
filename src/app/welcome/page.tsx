import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/brand/illustrations";
import { Button } from "@/components/ui/Button";

/**
 * Landing / welcome screen — ported from the mobile LandingScreen. Blue hero,
 * wordmark, prototype preview, and the two CTAs. Reached after onboarding.
 */
export default function WelcomePage() {
  return (
    <AppShell tone="brand">
      <div className="flex flex-1 flex-col px-6 py-10 md:px-8">
        <header className="text-center">
          <h1 className="font-poppins text-2xl font-extrabold text-white sm:text-3xl">
            Welcome to <span className="text-brand-accent">Kampos</span>
          </h1>
          <p className="mt-2 font-poppins text-sm text-white/80">
            Oya see our own workings!
          </p>
        </header>

        <div className="my-8 flex flex-1 items-center justify-center">
          <Illustration
            name="Prototype"
            className="h-full max-h-[42vh] w-auto max-w-full drop-shadow-2xl"
          />
        </div>

        <div className="space-y-6">
          <p className="text-center font-poppins text-sm leading-relaxed text-white/85">
            Oya, enough talk — it&apos;s time to dive in and experience Kampos
            for yourself. Tap in, let&apos;s make some crazy memories together fr
            fr. 🚀
          </p>

          <div className="space-y-3">
            <Link href="/login" className="block">
              <Button variant="secondary">Hop in</Button>
            </Link>
            <Link href="/signup" className="block">
              <Button
                variant="primary"
                className="border-2 border-white/70 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.5)]"
              >
                Join Kampos
              </Button>
            </Link>

            {/* Dev-only shortcut so the feed is reachable without a live backend. */}
            {process.env.NODE_ENV === "development" && (
              <Link
                href="/feed"
                className="block text-center font-poppins text-xs text-white/70 underline underline-offset-4"
              >
                Peek the feed (dev) →
              </Link>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
