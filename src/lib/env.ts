/**
 * Centralised, validated access to public runtime config.
 * Fails fast in the server/build if something required is missing/malformed,
 * so we never ship a client pointing at a broken API origin.
 */
function readApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const value = raw && raw.length > 0 ? raw : "https://kamposbackend-tj1s.onrender.com";
  try {
    // Throws on malformed URLs.
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_URL is not a valid URL: "${value}"`);
  }
  return value.replace(/\/$/, "");
}

export const env = {
  /** Backend origin, e.g. https://kamposbackend-tj1s.onrender.com */
  API_URL: readApiUrl(),
  /** Full REST base, e.g. https://.../api/v1 */
  get API_BASE() {
    return `${this.API_URL}/api/v1`;
  },
} as const;
