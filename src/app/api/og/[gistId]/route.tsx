import { ImageResponse } from "next/og";
import { fetchGistContext } from "@/lib/serverGist";
import { gistColorFor } from "@/lib/brand";
import { timeAgo } from "@/lib/format";

export const runtime = "nodejs";

const WIDTH = 1200;
// Taller than the standard 1.91:1 OG ratio (1200x630) on purpose — gives the
// text room to breathe above the image instead of squeezing both into a
// short card. Some link-preview surfaces (X, Facebook) center-crop non-2:1
// images to their own tile shape, but WhatsApp/iMessage/Slack and the image
// opened directly all render it at full size, and this app's own share flow
// links straight to the image, so that tradeoff is worth it here.
const HEIGHT = 900;

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

// Covers everything the card actually renders — plain ASCII plus the
// accented Latin letters that show up in real names, plus the punctuation
// used elsewhere in this file (em dash, ellipsis, curly quotes). Loaded
// ONCE per server process and cached in module scope, rather than
// re-subsetting to each individual gist's exact characters on every single
// request — that per-request Google Fonts round trip (CSS fetch + font
// file fetch, x2 for both weights) was the biggest chunk of this route's
// latency, and it was pure waste: a fixed, slightly-larger-but-still-tiny
// font file loaded once outperforms a "perfectly" subset one refetched on
// every request. A gist with some genuinely exotic character outside this
// set just falls back to a mismatched glyph for that one character, same
// as before, but that's now the rare case instead of the guaranteed one.
const FONT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑÇàáâãäåèéêëìíîïòóôõöùúûüñç0123456789 .,!?'\"-–—:;()&%/@#*+…·";

let fontsPromise: Promise<{ bold: ArrayBuffer; extraBold: ArrayBuffer }> | null = null;

function loadFonts(): Promise<{ bold: ArrayBuffer; extraBold: ArrayBuffer }> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadGoogleFont("Poppins", 700, FONT_CHARSET),
      loadGoogleFont("Poppins", 800, FONT_CHARSET),
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

const TAG_STYLE = {
  display: "flex",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 15,
  fontWeight: 700,
  // Uppercased in JS below (tags.map), not via CSS text-transform — the
  // font subset only ever contains glyphs for characters actually present
  // in the *source* string. Campus/major tags are stored lowercase, so a
  // CSS-only uppercase transform displays letters Satori never actually
  // loaded glyph data for, and it silently substitutes a different,
  // mismatched font for exactly those characters.
  letterSpacing: 0.4,
  background: "rgba(22, 90, 191, 0.1)",
  color: "#165abf",
};

// Satori (what ImageResponse renders through) has no real emoji-font
// support of its own — it falls back to substituting a generic inline
// image per glyph, which doesn't baseline-align with the surrounding text
// and shows up as visible artifacts (a stray underline, odd vertical
// offset) right in the rendered image. Since this app's actual gist text
// is emoji-heavy by design, that's not an edge case here, it's the norm —
// stripped from the static OG image only; the real GistCard in the app
// (genuine browser rendering, not Satori) still shows emoji completely
// normally everywhere else.
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu;

function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, "").replace(/ {2,}/g, " ").trim();
}

export async function GET(request: Request, { params }: { params: Promise<{ gistId: string }> }) {
  const { gistId } = await params;
  // Independent of each other now that the font charset is fixed rather
  // than derived from this gist's own text — no more waiting on the gist
  // fetch before even starting the font load.
  const [context, fonts] = await Promise.all([fetchGistContext(gistId, 0, 0), loadFonts()]);

  if (!context) {
    return new Response("Gist not found", { status: 404 });
  }

  const { target } = context;
  const text = stripEmoji(target.gist_text ?? "");
  // Every media type shows here — images, GIFs/stickers (both just plain
  // image URLs from GIPHY, media_type IMAGE), and video too: a video has no
  // single frame to composite server-side directly, but Cloudinary already
  // generates a JPG poster frame for every uploaded video (thumbnail_url),
  // so that's what renders instead of skipping video gists outright. Only
  // a video with no thumbnail for some reason is actually dropped. A gist
  // with 2+ media items gets both side by side in the same slot a single
  // one would otherwise fill; beyond 2, only the first two show (matches
  // the compact-preview intent of an OG card, not the full gist).
  const images = (target.media ?? [])
    .map((m) => ({ key: m.media_id, url: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url }))
    .filter((m): m is { key: string; url: string } => !!m.url)
    .slice(0, 2);
  const hasMedia = images.length > 0;
  const cardColor = gistColorFor(target.gist_id);

  const displayName = stripEmoji(target.first_name || target.name || target.avitag || "");
  const postedAgo = timeAgo(target.created_at);
  const tags = [target.campus_tag, target.major_tag, target.level ? `${target.level}L` : null]
    .filter(Boolean)
    .map((t) => (t as string).toUpperCase());

  // Truncate to roughly what actually fits in the space each layout gives
  // the text — generous for the full-bleed no-media case, tighter once
  // media is eating half the card. Slightly less than before now that the
  // header row eats into the same vertical budget.
  const maxChars = hasMedia ? 260 : 420;
  const displayText = text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #eef3fc 0%, #dbe6fa 100%)",
          fontFamily: "Poppins",
        }}
      >
        <div
          style={{
            width: WIDTH - 96,
            height: HEIGHT - 96,
            display: "flex",
            flexDirection: "column",
            background: "#ffffff",
            borderRadius: 40,
            boxShadow: "0 30px 60px -20px rgba(17, 32, 54, 0.35)",
            padding: 48,
            position: "relative",
          }}
        >
          {/* Kampos wordmark, top-right */}
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 48,
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              color: "#0bb0ff",
            }}
          >
            Kampos
          </div>

          {/* Poster header — avatar, name/avitag/time, tags. Same fields
              GistCard's own header shows, same order. */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, paddingRight: 160 }}>
            <div
              style={{
                display: "flex",
                width: 76,
                height: 76,
                borderRadius: 999,
                overflow: "hidden",
                background: "#e3e8f2",
                flexShrink: 0,
              }}
            >
              {target.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={target.image_url}
                  width={76}
                  height={76}
                  style={{ objectFit: "cover", width: 76, height: 76 }}
                  alt=""
                />
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ display: "flex", fontSize: 26, fontWeight: 800, color: "#112036" }}>
                  {displayName}
                </span>
                <span style={{ display: "flex", fontSize: 19, fontWeight: 700, color: "#8892a6" }}>
                  {target.avitag}
                </span>
                {postedAgo && (
                  <span style={{ display: "flex", fontSize: 19, fontWeight: 700, color: "#8892a6" }}>
                    · {postedAgo}
                  </span>
                )}
              </div>
              {tags.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  {tags.map((t) => (
                    <span key={t} style={TAG_STYLE}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {hasMedia ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24, marginTop: 28 }}>
              <div
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 5,
                  overflow: "hidden",
                  fontSize: 30,
                  fontWeight: 700,
                  lineHeight: 1.35,
                  color: "#112036",
                }}
              >
                {displayText}
              </div>
              <div style={{ display: "flex", flex: 1, gap: 8 }}>
                {images.map((m) => (
                  <div
                    key={m.key}
                    style={{
                      display: "flex",
                      flex: 1,
                      borderRadius: 28,
                      overflow: "hidden",
                      background: "#f1f4f9",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      width={images.length > 1 ? 502 : 1008}
                      height={220}
                      style={{ objectFit: "cover", width: "100%", height: "100%" }}
                      alt=""
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 28,
                borderRadius: 28,
                padding: 48,
                background: cardColor,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: displayText.length < 100 ? 46 : 34,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  color: "#ffffff",
                  textAlign: "center",
                }}
              >
                {displayText}
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Poppins", data: fonts.bold, weight: 700, style: "normal" },
        { name: "Poppins", data: fonts.extraBold, weight: 800, style: "normal" },
      ],
    },
  );

  // A gist's OG card only really changes on an edit, and platforms that
  // matter most here (WhatsApp/X/Facebook) cache the image on their own
  // end regardless of what this header says — this mainly helps repeat
  // fetches hitting this app's own server/CDN in the short window right
  // after a link gets shared around.
  image.headers.set("Cache-Control", "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800");
  return image;
}
