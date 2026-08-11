/**
 * Brand constants ported from the mobile app: the gist-card color palette and
 * the onboarding copy. Keeping the pidgin voice identical to mobile is a
 * deliberate brand decision.
 */

// Muted dark backgrounds used for short, text-only gists (mobile Gist.tsx
// GistCard). One recipe, fixed 36% saturation / 25% lightness — only hue
// changes swatch to swatch. Trimmed from an earlier 12-hue set down to 8:
// an even spread around the wheel, each instantly recognizable by name,
// with the near-duplicates dropped (lime/cyan/indigo sat too close to
// yellow/teal/blue-purple to read as genuinely different picks) along with
// neutral gray, which isn't really a "color" choice.
export const GIST_CARD_PALETTE = [
  "#572929", // red
  "#574029", // orange
  "#575329", // yellow
  "#295730", // green
  "#29574b", // teal
  "#293857", // blue
  "#442957", // purple
  "#572940", // pink
] as const;

/**
 * Deterministically pick a palette color from a stable key (e.g. gist id), so a
 * given gist keeps the same color across renders instead of flickering.
 */
export function gistColorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return GIST_CARD_PALETTE[Math.abs(hash) % GIST_CARD_PALETTE.length];
}

// Stable identifiers for each palette swatch, same order as
// GIST_CARD_PALETTE — lets a poster's chosen color survive as a small
// string on the gist (color_key) instead of an array index that would
// silently point at a different color if the palette's order ever changes.
// Mirrored by hand in KamposBackend's gist.controller.ts (GIST_COLOR_KEYS)
// since that's a separate repo/language — keep both in sync if this list
// ever changes.
export const GIST_COLOR_KEYS = [
  "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink",
] as const;
export type GistColorKey = (typeof GIST_COLOR_KEYS)[number];

/**
 * Resolves a gist's actual hero color: the poster's own pick when they made
 * one (validated against GIST_COLOR_KEYS — never trust a stray string
 * straight into a lookup), falling back to the deterministic hash-based
 * pick for gists nobody explicitly colored.
 */
export function gistColorForGist(colorKey: string | null | undefined, fallbackSeed: string): string {
  if (colorKey) {
    const idx = GIST_COLOR_KEYS.indexOf(colorKey as GistColorKey);
    if (idx !== -1) return GIST_CARD_PALETTE[idx];
  }
  return gistColorFor(fallbackSeed);
}

const GIST_LIMIT = 700;

export const LIMITS = {
  gist: GIST_LIMIT,
  comment: GIST_LIMIT / 2, // 350 — half the main post limit
  bio: 250,
  otp: 6,
  avitagMax: 15,
  maxMediaPerGist: 2, // matches GistMediaOverlay, which only ever shows the first 2
} as const;

// Onboarding carousel content — Kappy the mascot, verbatim voice from mobile.
// Each entry's "look" is a dedicated component (KappyWaving photo / phone
// orbit / opportunities orbit — see OnboardingCarousel), not a swappable
// illustration name, so there's nothing to key here beyond the copy itself.
export const ONBOARDING = [
  {
    header: "You don show at last!",
    body: "Hey! I'm Kappy, Kampos' mascot. I lowkey want to give you all the spoilers, but I was told to keep it simple. Kampos is all about you, and we're super glad you finally showed up! 😎",
  },
  {
    header: "Gist and Updates",
    body: "Gists, rants, banters… school updates, academic circulars? Chill! Kampos drops you right in the middle of everything happening on your campus — anytime, anywhere.",
  },
  {
    header: "More things dey o!",
    body: "No vex — I can only give you a tip of the iceberg 😏. Oya, don't tell anyone, but see Kampos is cooking up more for you — learning, job opportunities, and maybe even love.",
  },
] as const;
