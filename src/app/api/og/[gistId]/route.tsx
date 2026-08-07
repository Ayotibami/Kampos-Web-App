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
// this fetches the actual font file at request time instead. Scoped to
// `text` (only the characters actually needed) keeps it fast and small
// rather than pulling the whole font's character set.
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl).then((r) => r.text());
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error(`Could not find font URL for ${family}`);
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
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
  const context = await fetchGistContext(gistId, 0, 0);

  if (!context) {
    return new Response("Gist not found", { status: 404 });
  }

  const { target } = context;
  const text = stripEmoji(target.gist_text ?? "");
  // Video has no single frame to composite in cleanly server-side without
  // extra tooling (ffmpeg etc.) — images only, same as a plain text gist
  // once nothing qualifies. A gist with 2+ images gets both side by side
  // in the same 460px slot a single image would otherwise fill; beyond 2,
  // only the first two show (matches the compact-preview intent of an OG
  // card, not the full gist).
  const images = (target.media ?? []).filter((m) => m.media_type !== "VIDEO").slice(0, 2);
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

  const fontText = `${displayText}${displayName}${target.avitag}${postedAgo}${tags.join("")}KamposCheckoutongistat`;
  const [poppinsBold, poppinsExtraBold] = await Promise.all([
    loadGoogleFont("Poppins", 700, fontText),
    loadGoogleFont("Poppins", 800, fontText),
  ]);

  return new ImageResponse(
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
                    key={m.media_url}
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
                      src={m.media_url}
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
        { name: "Poppins", data: poppinsBold, weight: 700, style: "normal" },
        { name: "Poppins", data: poppinsExtraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
