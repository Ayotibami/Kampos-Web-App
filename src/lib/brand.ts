/**
 * Brand constants ported from the mobile app: the gist-card color palette and
 * the onboarding copy. Keeping the pidgin voice identical to mobile is a
 * deliberate brand decision.
 */

// Muted dark backgrounds used for short, text-only gists (mobile Gist.tsx GistCard).
export const GIST_CARD_PALETTE = [
  "#572929", // red
  "#573E29", // orange
  "#575729", // olive
  "#3E5729", // lime
  "#2E5729", // green
  "#29573E", // teal
  "#295757", // cyan
  "#293E57", // blue
  "#2E2957", // indigo
  "#3E2957", // purple
  "#572948", // magenta
  "#292929", // neutral
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
export const ONBOARDING = [
  {
    illustration: "Kappyswag",
    header: "You don show at last!",
    body: "Hey! I'm Kappy, Kampos' mascot. I lowkey want to give you all the spoilers, but I was told to keep it simple. Kampos is all about you, and we're super glad you finally showed up! 😎",
  },
  {
    illustration: "Kappywithphone",
    header: "I know say you like Amebo and vibesss",
    body: "Gists, rants, banters… school updates, academic circulars? Chill! Kampos drops you right in the middle of everything happening on your campus — anytime, anywhere.",
  },
  {
    illustration: "Kappyup",
    header: "Kampos is your campus life in one app",
    body: "No vex — I can only give you a tip of the iceberg 😏. Oya, don't tell anyone, but see Kampos is cooking up more for you — learning, job opportunities, and maybe even love.",
  },
] as const;
