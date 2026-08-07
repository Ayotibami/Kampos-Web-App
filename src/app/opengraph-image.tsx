import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Kampos — your campus life in one app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site-wide default social-preview image — Next's `opengraph-image`
// file convention auto-wires this into every page's metadata that doesn't
// set its own (the /gist/[gistId] route does set its own, dynamic one via
// /api/og/[gistId] — this is what every other page falls back to). Static
// (no params), so it's rendered once and cached, unlike the per-gist route.
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl).then((r) => r.text());
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error(`Could not find font URL for ${family}`);
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export default async function Image() {
  const text = "KamposYour campus life in one app";
  const [bold, extraBold] = await Promise.all([
    loadGoogleFont("Poppins", 700, text),
    loadGoogleFont("Poppins", 800, text),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "radial-gradient(1200px 600px at 50% -10%, #2f74e0 0%, #165abf 38%, #0e3e87 100%)",
          fontFamily: "Poppins",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#ffffff" }}>Kampos</div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
          Your campus life in one app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Poppins", data: bold, weight: 700, style: "normal" },
        { name: "Poppins", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
