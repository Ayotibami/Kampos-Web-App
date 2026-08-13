import type { ReactNode } from "react";
import { Illustration } from "@/components/brand/illustrations";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * AppShell — the branded page frame.
 *
 * On phones it fills the viewport edge-to-edge (native-app feel). On larger
 * screens the content sits in a centered, elevated panel over a rich branded
 * backdrop (brand gradient + a faint doodle watermark) so desktop never looks
 * like a lonely card on a white void.
 *
 * variant:
 *  - "column" (default): a phone-width panel — used by auth, onboarding, profile.
 *  - "wide": a broader stage — used by the feed, where cards need room to fan out.
 *  - "landscape": a wide-but-short panel (~70% viewport width, reduced
 *    height) for desktop-native flows that shouldn't just be a scaled-up
 *    phone screen — e.g. profile setup steps, which read as a wizard dialog
 *    on desktop, not a portrait card.
 *  - "panel": a wide, tall card for desktop pages that are their own small
 *    app (a persistent side rail + a content pane next to it) rather than a
 *    single linear form — e.g. Settings. Same brand tint/doodle backdrop
 *    and rounded-card language as "landscape", just sized for two-pane
 *    content instead of a short wizard dialog, and without the corner
 *    wordmark (the rail itself is the "you're still in Kampos" anchor here).
 */
export function AppShell({
  children,
  variant = "column",
  tone = "light",
  className = "",
  outerHeader,
  outerFooter,
  chromeless = false,
  landscapeSize = "md",
}: {
  children: ReactNode;
  variant?: "column" | "wide" | "feed" | "landscape" | "panel";
  /** Panel background: "light" (off-white, most screens) or "brand" (blue hero, e.g. landing). */
  tone?: "light" | "brand";
  className?: string;
  /** Rendered above the panel, same width, outside the card itself — for
   * "landscape" on desktop, where a short wide card doesn't have room to
   * spare for a big heading, so the heading becomes page-level chrome
   * instead of card content. Desktop-only by nature (no separate lane on
   * mobile to place it in) — the caller is responsible for also rendering
   * a mobile version inside `children` if needed. */
  outerHeader?: ReactNode;
  /** Same idea as outerHeader, rendered below the panel instead. */
  outerFooter?: ReactNode;
  /** Strips the panel's own rounded/shadow/ring/overflow-clip chrome —
   * only the fixed height reservation stays, on "landscape". Use this when
   * the caller renders its own per-step animated card that owns the
   * bg/rounded/shadow itself (StepScaffold), so that whole visible card —
   * not just text inside a static frame — is what actually swings. */
  chromeless?: boolean;
  /** "landscape" only — "md" is the wizard's size (75vw, viewport-12rem
   * tall). "lg" is a bigger, more immersive card (88vw, viewport-6rem tall)
   * for standalone landscape screens with no outerHeader/outerFooter eating
   * into the reserved height, e.g. the welcome screen. */
  landscapeSize?: "md" | "lg";
}) {
  // "feed" breaks out to full width on desktop (the card sizes itself to the
  // screen). "wide"/"column" stay comfortable centered columns (mirror mobile).
  // "landscape" is deliberately the odd one out — a real desktop-shaped
  // dialog (wide, short) rather than a portrait phone card blown up.
  const isFeed = variant === "feed";
  const isLandscape = variant === "landscape";
  const isPanel = variant === "panel";
  const panelWidth = isFeed || isPanel
    ? "md:max-w-none"
    : isLandscape
        ? landscapeSize === "lg"
          ? "md:w-[88vw]"
          : "md:w-[75vw]"
        : variant === "wide"
          ? "md:max-w-[560px]"
          : "md:max-w-[440px]";
  // Chromeless (StepScaffold): keep a solid mobile background (there's no
  // backdrop behind it there — see below) but let the desktop backdrop peek
  // through between cards, since the per-step card now owns its own bg.
  const panelBg = chromeless
    ? "bg-surface text-ink md:bg-transparent"
    : tone === "brand"
      ? "bg-brand text-white"
      : "bg-surface text-ink";
  const panelChrome = chromeless
    ? isLandscape
      ? "md:h-[calc(100dvh-12rem)]"
      : ""
    : isFeed
      ? "md:min-h-dvh"
      : isPanel
        // No card chrome — full-bleed white page, same width idea as
        // "feed" — but a hard h-dvh + overflow-hidden (not min-h-dvh) so
        // the two-pane content never grows the whole page taller than the
        // viewport; the content pane scrolls internally instead (see
        // SettingsPageShell's own overflow-y-auto).
        ? "md:h-dvh md:overflow-hidden"
        : isLandscape
          // Fixed height, like every other variant (keeps the same centered,
          // defined-size card feel) — but calc'd against the viewport minus a
          // safe estimate of the outerHeader/outerFooter/gaps/lane-padding that
          // sit outside it, instead of a flat vh percentage that had no idea
          // those siblings existed and could overflow a shorter viewport.
          ? landscapeSize === "lg"
            ? "md:h-[calc(100dvh-6rem)] md:overflow-hidden md:rounded-[32px] md:shadow-[0_30px_80px_-24px_rgba(9,30,66,0.6)] md:ring-1 md:ring-black/5"
            : "md:h-[calc(100dvh-12rem)] md:overflow-hidden md:rounded-[32px] md:shadow-[0_30px_80px_-24px_rgba(9,30,66,0.6)] md:ring-1 md:ring-black/5"
          : "md:min-h-[600px] md:max-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-[32px] md:shadow-[0_30px_80px_-24px_rgba(9,30,66,0.6)] md:ring-1 md:ring-black/5";
  // "panel" is a hard h-dvh (exactly viewport height, see panelChrome
  // above) — any extra centering padding here would push its actual
  // rendered height past the viewport and force the whole page to scroll,
  // the same reason "feed" (also exactly viewport-sized) skips it too.
  const lanePad = isFeed || isPanel ? "" : "md:items-center md:py-6";

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* Backdrop (desktop only — phones use the panel edge-to-edge).
          "landscape" swaps the blue hero gradient for the same soft
          brand-tint + tiled doodle the feed uses — a big near-white card
          needs a page behind it that's visibly NOT white, not a loud brand
          gradient (this isn't a hero moment, it's a wizard step). The card
          itself stays distinguishable from that faint tint via its own
          strong shadow + rounded corners, same trick the feed's cards use
          against their own equally-soft backdrop. */}
      {isPanel ? null : isLandscape ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden bg-brand/[0.05] md:block dark:bg-brand/[0.08]"
        >
          <div
            className="absolute inset-0 opacity-55 dark:opacity-45 dark:invert"
            style={{
              backgroundImage: "url('/brand/doodles.svg')",
              backgroundRepeat: "repeat",
              backgroundSize: "280px auto",
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{
            background:
              "radial-gradient(1200px 600px at 50% -10%, #2f74e0 0%, var(--color-brand) 38%, var(--color-brand-dark) 100%)",
          }}
        >
          <Illustration
            name="Doodles"
            className="absolute inset-0 h-full w-full object-cover opacity-[0.06]"
            preserveAspectRatio="xMidYMid slice"
          />
        </div>
      )}

      {/* Brand anchor — this flow has no nav bar at all, so without this
          there's nothing confirming you're still on Kampos partway through
          setup. Sits in the corner, outside the centered lane, so it never
          competes with the step heading for attention. */}
      {isLandscape && (
        <div className="absolute left-8 top-8 z-10 hidden md:block">
          <Wordmark accentClassName="text-brand" className="text-lg" />
        </div>
      )}

      {/* Centered content lane. For column/wide, the panel height tracks the
          viewport (never overflows a laptop) and clips to rounded corners. The
          feed breaks out to full width. outerHeader/outerFooter (landscape
          only) sit above/below the panel, sharing its width, inside one
          flex-col stack so the trio centers together as a unit. */}
      <div className={`relative z-10 flex min-h-dvh w-full items-stretch justify-center ${lanePad}`}>
        <div className={`flex w-full ${panelWidth} flex-col gap-4`}>
          {outerHeader && <div className="hidden shrink-0 md:block">{outerHeader}</div>}
          <div className={`relative flex min-h-0 w-full flex-col ${panelBg} ${panelChrome} ${className}`}>
            {/* "panel" is full-bleed and opaque, so a backdrop sitting
                behind it (like landscape's) would never actually be
                visible — the doodle has to live on the panel's own visible
                surface instead, very faint since this is a real content
                page, not a hero/wizard moment. */}
            {isPanel ? (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 hidden opacity-[0.05] dark:opacity-[0.06] dark:invert md:block"
                  style={{
                    backgroundImage: "url('/brand/doodles.svg')",
                    backgroundRepeat: "repeat",
                    backgroundSize: "280px auto",
                  }}
                />
                <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">{children}</div>
              </>
            ) : (
              children
            )}
          </div>
          {outerFooter && <div className="hidden shrink-0 md:block">{outerFooter}</div>}
        </div>
      </div>
    </div>
  );
}
