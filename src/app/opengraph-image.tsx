import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const alt = "Kampos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site-wide default social-preview image — Next's `opengraph-image`
// file convention auto-wires this into every page's metadata that doesn't
// set its own (the /gist/[gistId] route does set its own, dynamic one via
// /api/og/[gistId] — this is what every other page falls back to). Static
// (no params), so it's rendered once at build time and cached, unlike the
// per-gist route. Just the logo, centered on its own brand blue — the
// same treatment most apps' default share cards use.
export default async function Image() {
  const logoPath = path.join(process.cwd(), "public", "brand", "kampos-logo.png");
  const logoBuffer = await readFile(logoPath);
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        {/* The logo's own background has a subtle gradient of its own —
            filling the whole canvas with the image itself (cropped, not
            letterboxed) avoids any visible seam a flat CSS background
            color behind a smaller centered copy would show. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoDataUri}
          width={size.width}
          height={size.height}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
          alt=""
        />
      </div>
    ),
    size,
  );
}
