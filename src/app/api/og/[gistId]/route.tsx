import { ImageResponse } from "next/og";
import { fetchGistContext } from "@/lib/serverGist";
import { gistColorFor } from "@/lib/brand";
import { timeAgo } from "@/lib/format";
import { loadOgFonts, OG_TAG_STYLE, stripEmoji } from "@/lib/ogShared";

export const runtime = "nodejs";

const WIDTH = 1200;
// Taller than the standard 1.91:1 OG ratio (1200x630) on purpose — gives the
// text room to breathe above the image instead of squeezing both into a
// short card. Some link-preview surfaces (X, Facebook) center-crop non-2:1
// images to their own tile shape, but WhatsApp/iMessage/Slack and the image
// opened directly all render it at full size, and this app's own share flow
// links straight to the image, so that tradeoff is worth it here.
const HEIGHT = 900;

export async function GET(request: Request, { params }: { params: Promise<{ gistId: string }> }) {
  const { gistId } = await params;
  // Independent of each other now that the font charset is fixed rather
  // than derived from this gist's own text — no more waiting on the gist
  // fetch before even starting the font load.
  const [context, fonts] = await Promise.all([fetchGistContext(gistId, 0, 0), loadOgFonts()]);

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
          fontFamily: "Nunito",
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
                    <span key={t} style={OG_TAG_STYLE}>
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
        { name: "Nunito", data: fonts.bold, weight: 700, style: "normal" },
        { name: "Nunito", data: fonts.extraBold, weight: 800, style: "normal" },
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
