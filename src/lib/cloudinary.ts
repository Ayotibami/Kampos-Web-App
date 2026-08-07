/**
 * Requests Cloudinary's own content-aware crop (g_auto — finds the actual
 * interesting region of the photo: faces, high-contrast areas, etc. — not a
 * blind "always crop from the top" guess) baked into the delivered image
 * itself, at a fixed representative aspect ratio matching the feed card's
 * media box. CSS `object-cover` on the frontend still does the final crop
 * to whatever the box's *actual* live ratio is at a given viewport, but
 * since the source is already well-composed by then, that residual crop
 * rarely cuts anything important.
 *
 * A no-op for anything that isn't actually a Cloudinary delivery URL (GIFs
 * attached from GIPHY, for instance) — those pass through untouched.
 */
export function cloudinarySmartCrop(url: string, aspectRatio = "4:3"): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}c_fill,g_auto,ar_${aspectRatio}/${url.slice(insertAt)}`;
}
