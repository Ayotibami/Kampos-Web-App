import { ImageResponse } from "next/og";
import { fetchStudentProfileByAvitag, normalizeStudentProfile } from "@/lib/serverProfile";
import { gistColorFor } from "@/lib/brand";
import { loadOgFonts, OG_TAG_STYLE, stripEmoji } from "@/lib/ogShared";

export const runtime = "nodejs";

// Standard 1.91:1 OG ratio, unlike the gist card's taller 1200x900 — that
// extra height exists there specifically to give a full-bleed attached
// photo/video room to breathe; a profile card has no such media slot (just
// a small circular avatar within a compact identity layout), so there's
// nothing to gain from the extra height and every reason to use the ratio
// every platform (X, Facebook, WhatsApp alike) crops cleanly.
const WIDTH = 1200;
const HEIGHT = 630;

function initialsFor(displayName: string, avitag: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return avitag.slice(0, 2).toUpperCase();
}

export async function GET(request: Request, { params }: { params: Promise<{ avitag: string }> }) {
  const { avitag } = await params;
  const [profile, fonts] = await Promise.all([fetchStudentProfileByAvitag(avitag), loadOgFonts()]);

  if (!profile) {
    return new Response("Profile not found", { status: 404 });
  }

  const { displayName: rawName, bio: rawBio, imageUrl, campusTag, majorTag, level } = normalizeStudentProfile(profile);
  const displayName = stripEmoji(rawName);
  const bio = stripEmoji(rawBio);
  const bioSnippet = bio.length > 140 ? `${bio.slice(0, 140).trimEnd()}…` : bio;
  const tags = [campusTag, majorTag, level ? `${level}L` : null].filter(Boolean).map((t) => (t as string).toUpperCase());
  const avatarColor = gistColorFor(avitag);

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
            padding: 56,
            position: "relative",
          }}
        >
          {/* Kampos wordmark, top-right — same placement as the gist card */}
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 56,
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              color: "#0bb0ff",
            }}
          >
            Kampos
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 40, flex: 1, paddingRight: 40 }}>
            {/* Avatar — the actual photo when there is one, otherwise a
                deterministic brand-color circle with initials (the same
                degrade Avatar.tsx uses everywhere else in the app, just a
                server-rendered equivalent since Satori can't run the
                client-side onError fallback that component relies on). */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 220,
                height: 220,
                borderRadius: 999,
                overflow: "hidden",
                background: imageUrl ? "#e3e8f2" : avatarColor,
                flexShrink: 0,
              }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  width={220}
                  height={220}
                  style={{ objectFit: "cover", width: 220, height: 220 }}
                  alt=""
                />
              ) : (
                <span style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#ffffff" }}>
                  {initialsFor(displayName, avitag)}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              {/* avitag is the headline, not the full name — the identity
                  people actually recognize each other by on Kampos. Bare,
                  no @ prefix — Kampos doesn't use that convention anywhere
                  else in the app, so it doesn't start here either. */}
              <span style={{ display: "flex", fontSize: 46, fontWeight: 800, color: "#112036" }}>
                {avitag}
              </span>

              {tags.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  {tags.map((t) => (
                    <span key={t} style={OG_TAG_STYLE}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {bioSnippet && (
                <div
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 3,
                    overflow: "hidden",
                    fontSize: 24,
                    fontWeight: 700,
                    fontStyle: "italic",
                    lineHeight: 1.4,
                    color: "#3a4658",
                  }}
                >
                  {bioSnippet}
                </div>
              )}
            </div>
          </div>
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

  // A profile's OG card only really changes when they edit their bio/photo/
  // campus/major — same caching reasoning as the gist route.
  image.headers.set("Cache-Control", "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800");
  return image;
}
