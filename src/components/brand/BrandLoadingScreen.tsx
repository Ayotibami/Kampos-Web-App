import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Loading placeholder for the two full-bleed solid-brand screens (root
 * onboarding carousel, /welcome) — neither uses AppShell/AuthShell (both are
 * bespoke full-bleed layouts), so there's no existing shell to slot a
 * skeleton into. A plain pulsing wordmark on the same brand-blue background
 * both screens already use keeps this from being a jarring flash of
 * unstyled white before the real screen appears.
 */
export function BrandLoadingScreen() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-brand">
      <div className="animate-pulse">
        <Wordmark accentClassName="text-brand-accent" className="text-2xl text-white" />
      </div>
    </div>
  );
}
