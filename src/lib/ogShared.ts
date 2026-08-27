/**
 * Shared building blocks for every `next/og` `ImageResponse` route
 * (currently the gist share card and the profile share card) — the Google
 * Font loading dance, the emoji-stripping Satori needs, and the tag-pill
 * style, all factored out here once both routes needed the exact same
 * thing rather than drifting into two near-identical copies.
 */

// The standard Vercel-documented technique for loading a real Google Font
// into Satori (what ImageResponse renders through) — next/font's own
// downloads happen at build time as CSS, not as bytes this API can use, so
// this fetches the actual font file at request time instead.
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl).then((r) => r.text());
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error(`Could not find font URL for ${family}`);
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

// Covers everything an OG card actually renders — plain ASCII plus the
// accented Latin letters that show up in real names, plus the punctuation
// used across these cards (em dash, ellipsis, curly quotes). Loaded ONCE
// per server process and cached in module scope, rather than re-subsetting
// to each individual request's exact characters — that per-request Google
// Fonts round trip (CSS fetch + font file fetch, x2 for both weights) was
// the biggest chunk of these routes' latency, and it was pure waste: a
// fixed, slightly-larger-but-still-tiny font file loaded once outperforms a
// "perfectly" subset one refetched on every request. Text with some
// genuinely exotic character outside this set just falls back to a
// mismatched glyph for that one character, same as before, but that's now
// the rare case instead of the guaranteed one.
const OG_FONT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑÇàáâãäåèéêëìíîïòóôõöùúûüñç0123456789 .,!?'\"-–—:;()&%/@#*+…·";

let fontsPromise: Promise<{ bold: ArrayBuffer; extraBold: ArrayBuffer }> | null = null;

/** Nunito 700/800, cached across requests in this server process. */
export function loadOgFonts(): Promise<{ bold: ArrayBuffer; extraBold: ArrayBuffer }> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadGoogleFont("Nunito", 700, OG_FONT_CHARSET),
      loadGoogleFont("Nunito", 800, OG_FONT_CHARSET),
    ])
      .then(([bold, extraBold]) => ({ bold, extraBold }))
      .catch((err) => {
        // Don't poison the cache on a transient network failure — the next
        // request gets to try loading fresh instead of failing forever.
        fontsPromise = null;
        throw err;
      });
  }
  return fontsPromise;
}

export const OG_TAG_STYLE = {
  display: "flex",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 15,
  fontWeight: 700,
  // Uppercased in JS by the caller, not via CSS text-transform — the font
  // subset only ever contains glyphs for characters actually present in the
  // *source* string. Tags are stored lowercase, so a CSS-only uppercase
  // transform displays letters Satori never actually loaded glyph data for,
  // and it silently substitutes a different, mismatched font for exactly
  // those characters.
  letterSpacing: 0.4,
  background: "rgba(22, 90, 191, 0.1)",
  color: "#165abf",
} as const;

// Satori (what ImageResponse renders through) has no real emoji-font
// support of its own — it falls back to substituting a generic inline
// image per glyph, which doesn't baseline-align with the surrounding text
// and shows up as visible artifacts (a stray underline, odd vertical
// offset) right in the rendered image. Stripped from these static OG
// images only; genuine browser rendering elsewhere in the app still shows
// emoji completely normally.
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu;

export function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "").replace(/ {2,}/g, " ").trim();
}
