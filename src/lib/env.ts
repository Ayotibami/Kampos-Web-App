/**
 * Centralised, validated access to public runtime config.
 * Fails fast in the server/build if something required is missing/malformed,
 * so we never ship a client pointing at a broken API origin.
 */
function readApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const value = raw && raw.length > 0 ? raw : "https://kamposbackend-001.onrender.com";
  try {
    // Throws on malformed URLs.
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_URL is not a valid URL: "${value}"`);
  }
  return value.replace(/\/$/, "");
}

function readSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const value = raw && raw.length > 0 ? raw : "http://localhost:3000";
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_SITE_URL is not a valid URL: "${value}"`);
  }
  return value.replace(/\/$/, "");
}

export const env = {
  /** Backend origin, e.g. https://kamposbackend-001.onrender.com */
  API_URL: readApiUrl(),
  /** Full REST base, e.g. https://.../api/v1 */
  get API_BASE() {
    return `${this.API_URL}/api/v1`;
  },
  /** This site's own public origin — required for Next to resolve relative
   * OG/Twitter image URLs (e.g. /api/og/[gistId]) into absolute ones.
   * Without it, share-preview crawlers (WhatsApp/X/Facebook/...) get a
   * localhost or preview-deploy URL they can't reach. Must be set to the
   * real production domain wherever this app is actually deployed. */
  SITE_URL: readSiteUrl(),
  /** GIPHY API key for the GIF/sticker picker — free from
   * https://developers.giphy.com. Empty until set; GiphyPicker shows
   * a "not configured yet" state rather than failing requests with an
   * invalid key. Client-exposed on purpose (NEXT_PUBLIC_) — this is how
   * GIPHY expects browser-based integrations to call it. */
  GIPHY_API_KEY: process.env.NEXT_PUBLIC_GIPHY_API_KEY?.trim() ?? "",
} as const;
