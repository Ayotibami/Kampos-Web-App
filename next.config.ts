import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Backend origin used for connect-src (REST + websockets). Kept in sync with NEXT_PUBLIC_API_URL.
const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || "https://kamposbackend-001.onrender.com"
).replace(/\/$/, "");
const WS_ORIGIN = API_ORIGIN.replace(/^http/, "ws");

/**
 * Content-Security-Policy.
 * - `unsafe-eval` is only allowed in dev (Next/Turbopack HMR needs it).
 * - Images/media come from Cloudinary (the backend's media host) + blobs (local previews/webcam).
 * - Fonts are self-hosted by next/font, so no external font hosts are required.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  // Dev-only: picsum.photos + w3schools.com back the demo sample gists'
  // placeholder media (no real backend media exists yet to test against).
  // Never allowed in production — only Cloudinary, the real media host, is.
  // *.giphy.com covers the GIF/sticker picker's media CDN (thumbnails +
  // full-size images both come from Giphy-hosted subdomains, not ours).
  `img-src 'self' data: blob: https://res.cloudinary.com https://*.giphy.com${isDev ? " https://picsum.photos https://fastly.picsum.photos" : ""}`,
  `media-src 'self' blob: https://res.cloudinary.com https://*.giphy.com${isDev ? " https://www.w3schools.com" : ""}`,
  `font-src 'self'`,
  // api.giphy.com: the GIF/sticker picker's search/trending requests.
  // api.cloudinary.com: the browser uploads media straight there (see
  // uploadToCloudinaryDirect) — without it in connect-src the browser
  // silently blocks that XHR, which surfaces as a bare "network error",
  // not a CSP violation, making it look like a connectivity problem.
  `connect-src 'self' ${API_ORIGIN} ${WS_ORIGIN} https://api.giphy.com https://api.cloudinary.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
]
  .join("; ")
  .concat(isDev ? "" : "; upgrade-insecure-requests");

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Import `.svg` files as React components (SVGR) under both Turbopack (dev) and webpack (build).
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      use: ["@svgr/webpack"],
    });
    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Allow webcam capture on our own origin only; deny mic/geolocation.
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
